import json as _json
import logging
import math
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.db import Database as SqliteDatabase
from app.influx import InfluxClient
from app.moonraker import MoonrakerClient
from app.routes.dependencies import Cache, Database, GcodeMetaReader, Influx, Moonraker

router = APIRouter(tags=["prints"])

log = logging.getLogger(__name__)

_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001
_COST_FIELDS = ("avg_watts", "avg_eur_per_kwh", "cost_electricity", "cost_filament", "cost_total")
_COST_WINDOW_MINUTES = 5

GcodeMetaFunction = Callable[[str], Awaitable[dict[str, Any]]]


def _photos_dir(job_id: str) -> Path:
    """Return (and create) the photo directory for a job."""
    data_dir = Path(settings.database_path).parent
    photos_dir = data_dir / "photos" / job_id
    photos_dir.mkdir(parents=True, exist_ok=True)
    return photos_dir


async def _read_job(moonraker: MoonrakerClient, job_id: str) -> dict[str, Any]:
    """The job of Moonraker; a printer that cannot be reached has no job."""
    try:
        return (await moonraker.get("/server/history/job", uid=job_id)).get("job", {})
    except Exception as exc:
        log.warning("prints: failed to fetch moonraker job %s: %s", job_id, exc)
        return {}


def _read_minute(row: dict[str, Any]) -> int | None:
    try:
        return int(datetime.fromisoformat(row.get("time", "").replace("Z", "+00:00")).timestamp()) // 60
    except Exception:
        return None


def _find_cost(rows: list[dict[str, Any]], filename: str, end_timestamp: float) -> dict[str, Any] | None:
    """The first row of the file whose minute lies within five minutes of the end of the print."""
    end_minute = int(end_timestamp) // 60
    for row in rows:
        minute = _read_minute(row)
        if minute is None:
            continue
        if row.get("filename") == filename and abs(minute - end_minute) <= _COST_WINDOW_MINUTES:
            return row
    return None


def _describe_spool(print_spool: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": print_spool.get("spool_id"),
        "brand": print_spool.get("brand"),
        "material": print_spool.get("material"),
        "color": print_spool.get("color"),
        "color_hex": print_spool.get("color_hex"),
    }


def _describe_job(job_id: str, job: dict[str, Any]) -> dict[str, Any]:
    end_timestamp = job.get("end_time", 0) or 0
    return {
        "job_id": job_id,
        "filename": job.get("filename", ""),
        "status": job.get("status", ""),
        "time": datetime.fromtimestamp(end_timestamp, tz=UTC).isoformat().replace("+00:00", "Z")
        if end_timestamp
        else None,
        "duration_s": job.get("print_duration", 0),
        "filament_g": round((job.get("filament_used", 0) or 0) * _MM_TO_GRAMS, 2),
        **dict.fromkeys(_COST_FIELDS),
        "spool": None,
    }


async def _get_job_stats(
    moonraker: MoonrakerClient, influx: InfluxClient, database: SqliteDatabase, job_id: str
) -> dict[str, Any]:
    """Fetch stats for a single job from Moonraker + InfluxDB + SQLite."""
    job = await _read_job(moonraker, job_id)
    record = _describe_job(job_id, job)
    end_timestamp = job.get("end_time", 0) or 0
    if end_timestamp and record["filename"]:
        cost = _find_cost(await influx.query_history(limit=20), record["filename"], end_timestamp)
        for field in _COST_FIELDS:
            record[field] = cost.get(field) if cost else None
    print_spool = await database.get_print_spool(job_id)
    if print_spool:
        record["spool"] = _describe_spool(print_spool)
    return record


async def _lazy_load_gcode_meta(
    moonraker: MoonrakerClient,
    database: SqliteDatabase,
    read_gcode_meta: GcodeMetaFunction,
    job_id: str,
    job_row: dict[str, Any],
) -> None:
    """Read the gcode metadata of a print once and keep it with the print."""
    if job_row.get("gcode_meta"):
        return
    filename = (await _read_job_quietly(moonraker, job_id)).get("filename", "")
    if not filename:
        return
    try:
        gcode_meta = await read_gcode_meta(filename)
        if gcode_meta is not None:
            await database.update_print_job(job_id, {"gcode_meta": _json.dumps(gcode_meta)})
            job_row["gcode_meta"] = gcode_meta
    except Exception as exc:
        log.debug("prints: lazy gcode_meta failed for %s: %s", job_id, exc)


async def _read_job_quietly(moonraker: MoonrakerClient, job_id: str) -> dict[str, Any]:
    try:
        return (await moonraker.get("/server/history/job", uid=job_id)).get("job", {})
    except Exception:
        return {}


async def _build_print_detail(
    moonraker: MoonrakerClient,
    influx: InfluxClient,
    database: SqliteDatabase,
    read_gcode_meta: GcodeMetaFunction,
    job_id: str,
) -> dict[str, Any]:
    job_row = await database.get_or_create_print_job(job_id)
    await _lazy_load_gcode_meta(moonraker, database, read_gcode_meta, job_id, job_row)
    stats = await _get_job_stats(moonraker, influx, database, job_id)
    photos = await database.list_print_photos(job_id)
    project = await database.get_project_for_job(job_id)
    return {
        **stats,
        **job_row,
        "photos": photos,
        "project": {"id": project["id"], "name": project["name"]} if project else None,
    }


@router.get("/api/prints/{job_id}")
async def get_print_detail(
    job_id: str,
    moonraker: Moonraker,
    influx: Influx,
    database: Database,
    cache: Cache,
    read_gcode_meta: GcodeMetaReader,
) -> dict[str, Any]:
    async def fetch_detail() -> dict[str, Any]:
        return await _build_print_detail(moonraker, influx, database, read_gcode_meta, job_id)

    return await cache.get_or_set(f"print:{job_id}", fetch_detail, ttl=3600)


class PrintUpdate(BaseModel):
    notes: str | None = None
    settings: dict[str, str | None] | None = None


def _collect_print_changes(body: PrintUpdate) -> dict[str, Any]:
    changes = {key: value for key, value in body.model_dump().items() if value is not None}
    if "settings" in changes:
        changes["settings"] = _json.dumps(changes["settings"])
    return changes


@router.patch("/api/prints/{job_id}")
async def update_print(job_id: str, body: PrintUpdate, database: Database, cache: Cache) -> dict[str, Any]:
    changes = _collect_print_changes(body)
    result = await database.update_print_job(job_id, changes)
    if changes:
        await cache.invalidate(f"print:{job_id}")
    return result


@router.get("/api/prints/{job_id}/photos")
async def list_photos(job_id: str, database: Database) -> list[dict[str, Any]]:
    return await database.list_print_photos(job_id)


@router.post("/api/prints/{job_id}/photos")
async def upload_photo(job_id: str, file: UploadFile, database: Database, cache: Cache) -> dict[str, Any]:
    safe_name = Path(file.filename or "photo.jpg").name
    filename = f"{int(time.time())}_{safe_name}"
    (_photos_dir(job_id) / filename).write_bytes(await file.read())
    result = await database.add_print_photo(job_id, filename, source="upload")
    await cache.invalidate(f"print:{job_id}")
    return result


def _remove_photo_file(job_id: str, filename: str) -> None:
    """Remove the file of a photo from the disk (best-effort)."""
    try:
        file_path = _photos_dir(job_id) / filename
        if file_path.exists():
            file_path.unlink()
    except Exception as exc:
        log.warning("prints: failed to delete photo file %s: %s", filename, exc)


@router.delete("/api/prints/{job_id}/photos/{photo_id}")
async def delete_photo(job_id: str, photo_id: int, database: Database, cache: Cache) -> dict[str, Any]:
    photos = await database.list_print_photos(job_id)
    photo = next((photo for photo in photos if photo["id"] == photo_id), None)
    if not photo:
        raise HTTPException(404, "Photo not found")
    _remove_photo_file(job_id, photo["filename"])
    await database.delete_print_photo(photo_id)
    await cache.invalidate(f"print:{job_id}")
    return {"deleted": photo_id}


@router.get("/api/photos/{job_id}/{filename}")
async def serve_photo(job_id: str, filename: str) -> FileResponse:
    data_dir = Path(settings.database_path).parent
    file_path = data_dir / "photos" / job_id / filename
    if not file_path.exists():
        raise HTTPException(404, "Photo not found")
    return FileResponse(str(file_path))
