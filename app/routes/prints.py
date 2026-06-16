import json as _json
import logging
import math
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app import cache, db
from app.config import settings
from app.gcode_meta import extract_gcode_meta
from app.influx import influx
from app.moonraker import moonraker

router = APIRouter(tags=["prints"])

log = logging.getLogger(__name__)

_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001


def _photos_dir(job_id: str) -> Path:
    """Return (and create) the photo directory for a job."""
    data_dir = Path(settings.database_path).parent
    d = data_dir / "photos" / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _get_job_stats(job_id: str) -> dict[str, Any]:
    """Fetch stats for a single job from Moonraker + InfluxDB + SQLite."""
    try:
        job_data = await moonraker.get("/server/history/job", uid=job_id)
        job = job_data.get("job", {})
    except Exception as exc:
        log.warning("prints: failed to fetch moonraker job %s: %s", job_id, exc)
        job = {}

    filament_mm = job.get("filament_used", 0) or 0
    filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
    end_ts = job.get("end_time", 0) or 0
    filename = job.get("filename", "")

    record: dict[str, Any] = {
        "job_id": job_id,
        "filename": filename,
        "status": job.get("status", ""),
        "time": datetime.fromtimestamp(end_ts, tz=UTC).isoformat().replace("+00:00", "Z") if end_ts else None,
        "duration_s": job.get("print_duration", 0),
        "filament_g": filament_g,
        "avg_watts": None,
        "avg_eur_per_kwh": None,
        "cost_electricity": None,
        "cost_filament": None,
        "cost_total": None,
        "spool": None,
    }

    # InfluxDB cost enrichment
    if end_ts and filename:
        record_minute = int(end_ts) // 60
        influx_all = influx.query_history(limit=20)
        cost = None
        for r in influx_all:
            try:
                r_minute = int(datetime.fromisoformat(r.get("time", "").replace("Z", "+00:00")).timestamp()) // 60
            except Exception:
                continue
            if r.get("filename") == filename and abs(r_minute - record_minute) <= 5:
                cost = r
                break
        if cost:
            record["avg_watts"] = cost.get("avg_watts")
            record["avg_eur_per_kwh"] = cost.get("avg_eur_per_kwh")
            record["cost_electricity"] = cost.get("cost_electricity")
            record["cost_filament"] = cost.get("cost_filament")
            record["cost_total"] = cost.get("cost_total")

    # Spool info
    ps = await db.get_print_spool(job_id)
    if ps:
        record["spool"] = {
            "id": ps.get("spool_id"),
            "brand": ps.get("brand"),
            "material": ps.get("material"),
            "color": ps.get("color"),
            "color_hex": ps.get("color_hex"),
        }

    return record


@router.get("/api/prints/{job_id}")
async def get_print_detail(job_id: str) -> dict[str, Any]:
    async def _fetch() -> dict[str, Any]:
        job_row = await db.get_or_create_print_job(job_id)

        if not job_row.get("gcode_meta"):
            filename = ""
            try:
                job_data = await moonraker.get("/server/history/job", uid=job_id)
                filename = job_data.get("job", {}).get("filename", "")
            except Exception:
                pass
            if filename:
                try:
                    gcode_meta = await extract_gcode_meta(filename)
                    if gcode_meta is not None:
                        await db.update_print_job(job_id, {"gcode_meta": _json.dumps(gcode_meta)})
                        job_row["gcode_meta"] = gcode_meta
                except Exception as exc:
                    log.debug("prints: lazy gcode_meta failed for %s: %s", job_id, exc)

        stats = await _get_job_stats(job_id)
        photos = await db.list_print_photos(job_id)
        proj = await db.get_project_for_job(job_id)
        project = {"id": proj["id"], "name": proj["name"]} if proj else None
        return {**stats, **job_row, "photos": photos, "project": project}

    return await cache.get_or_set(f"print:{job_id}", _fetch, ttl=3600)


class PrintUpdate(BaseModel):
    notes: str | None = None
    settings: dict[str, str | None] | None = None


@router.patch("/api/prints/{job_id}")
async def update_print(job_id: str, body: PrintUpdate) -> dict[str, Any]:
    raw = body.model_dump()
    data: dict[str, Any] = {}
    for k, v in raw.items():
        if v is None:
            continue
        if k == "settings":
            data[k] = _json.dumps(v)
        else:
            data[k] = v
    result = await db.update_print_job(job_id, data)
    await cache.invalidate(f"print:{job_id}")
    return result


@router.get("/api/prints/{job_id}/photos")
async def list_photos(job_id: str) -> list[dict[str, Any]]:
    return await db.list_print_photos(job_id)


@router.post("/api/prints/{job_id}/photos")
async def upload_photo(job_id: str, file: UploadFile) -> dict[str, Any]:
    ts = int(time.time())
    safe_name = Path(file.filename or "photo.jpg").name
    filename = f"{ts}_{safe_name}"
    dest = _photos_dir(job_id) / filename

    content = await file.read()
    dest.write_bytes(content)

    result = await db.add_print_photo(job_id, filename, source="upload")
    await cache.invalidate(f"print:{job_id}")
    return result


@router.delete("/api/prints/{job_id}/photos/{photo_id}")
async def delete_photo(job_id: str, photo_id: int) -> dict[str, Any]:
    photos = await db.list_print_photos(job_id)
    photo = next((p for p in photos if p["id"] == photo_id), None)
    if not photo:
        raise HTTPException(404, "Photo not found")

    # Remove file from disk (best-effort)
    try:
        file_path = _photos_dir(job_id) / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    except Exception as exc:
        log.warning("prints: failed to delete photo file %s: %s", photo["filename"], exc)

    await db.delete_print_photo(photo_id)
    await cache.invalidate(f"print:{job_id}")
    return {"deleted": photo_id}


@router.get("/api/photos/{job_id}/{filename}")
async def serve_photo(job_id: str, filename: str) -> FileResponse:
    data_dir = Path(settings.database_path).parent
    file_path = data_dir / "photos" / job_id / filename
    if not file_path.exists():
        raise HTTPException(404, "Photo not found")
    return FileResponse(str(file_path))
