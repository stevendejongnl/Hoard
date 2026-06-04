import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db, ha
from app.influx import influx
from app.moonraker import moonraker

router = APIRouter(prefix="/api/history", tags=["history"])

# 1.75mm PLA filament: π × (0.875mm)² × 1.24 g/cm³ × 0.001 cm³/mm³
_MM_TO_GRAMS = math.pi * (0.875 ** 2) * 1.24 * 0.001


def _moonraker_to_record(job: dict[str, Any]) -> dict[str, Any]:
    filament_mm = job.get("filament_used", 0) or 0
    filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
    end_ts = job.get("end_time", 0) or 0
    start_ts = job.get("start_time", 0) or 0
    return {
        "job_id": job.get("job_id", ""),
        "filename": job.get("filename", ""),
        "time": datetime.fromtimestamp(end_ts, tz=timezone.utc).isoformat().replace("+00:00", "Z") if end_ts else None,
        "duration_s": job.get("print_duration", 0),
        "filament_g": filament_g,
        "status": job.get("status", ""),
        # cost fields — filled from InfluxDB if available
        "avg_watts": None,
        "avg_eur_per_kwh": None,
        "cost_electricity": None,
        "cost_filament": None,
        "cost_total": None,
        "spool": None,
        "_source": "moonraker",
    }


@router.get("")
async def list_history(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    # Always use Moonraker as the source of truth for print records
    try:
        result = await moonraker.get(
            "/server/history/list",
            limit=limit,
            start=offset,
            order="desc",
        )
        jobs = result.get("jobs", [])
        total = result.get("count", len(jobs))
    except Exception:
        jobs = []
        total = 0

    records = [_moonraker_to_record(j) for j in jobs if j.get("status") == "completed"]

    # Enrich with InfluxDB cost data — match by filename+timestamp so two prints of
    # the same file each get their own InfluxDB entry, not the most-recent one.
    influx_all = influx.query_history(limit=500)

    def _influx_minute(iso: str) -> int:
        """Convert ISO timestamp to minute-level Unix int for proximity matching."""
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return int(dt.timestamp()) // 60
        except Exception:
            return 0

    # Build (filename, minute) → influx record
    influx_by_file_minute: dict[tuple[str, int], dict[str, Any]] = {}
    for r in influx_all:
        key = (r.get("filename", ""), _influx_minute(r.get("time", "")))
        influx_by_file_minute[key] = r

    for record in records:
        filename = record["filename"]
        job_id = record["job_id"]

        # Merge InfluxDB cost data — try exact minute, then ±5 min
        end_ts = next(
            (j.get("end_time", 0) for j in jobs if j.get("job_id") == job_id), 0
        ) or 0
        record_minute = int(end_ts) // 60
        cost = influx_by_file_minute.get((filename, record_minute))
        if not cost:
            for delta in range(1, 6):
                cost = influx_by_file_minute.get((filename, record_minute - delta))
                if cost:
                    break
                cost = influx_by_file_minute.get((filename, record_minute + delta))
                if cost:
                    break

        if cost:
            record["avg_watts"] = cost.get("avg_watts")
            record["avg_eur_per_kwh"] = cost.get("avg_eur_per_kwh")
            record["cost_electricity"] = cost.get("cost_electricity")
            record["cost_filament"] = cost.get("cost_filament")
            record["cost_total"] = cost.get("cost_total")
            record["_source"] = "influx"

        # Spool info from SQLite
        ps = await db.get_print_spool(job_id)
        if ps:
            record["spool"] = {
                "id": ps.get("spool_id"),
                "brand": ps.get("brand"),
                "material": ps.get("material"),
                "color": ps.get("color"),
                "color_hex": ps.get("color_hex"),
            }

        # Project link from SQLite
        proj = await db.get_project_for_job(job_id)
        if proj:
            record["project"] = {"id": proj["id"], "name": proj["name"]}

    return {"records": records, "total": total, "limit": limit, "offset": offset}


class SpoolAssign(BaseModel):
    spool_id: int


@router.patch("/{job_id}/spool")
async def assign_spool(job_id: str, body: SpoolAssign) -> dict[str, Any]:
    spools = await db.list_spools()
    spool = next((s for s in spools if s["id"] == body.spool_id), None)
    if not spool:
        raise HTTPException(404, "Spool not found")

    existing = await db.get_print_spool(job_id)
    filament_g = existing["filament_used_g"] if existing else 0
    await db.link_print_spool(job_id, body.spool_id, filament_g)

    # Recalculate costs using actual HA history for the print's time window
    try:
        job_data = await moonraker.get("/server/history/job", uid=job_id)
        job = job_data.get("job", {})
        filename = job.get("filename", job_id)
        start_ts = job.get("start_time", 0)
        end_ts = job.get("end_time", 0)
        duration_s = job.get("print_duration", 0)
        if not filament_g:
            filament_mm = job.get("filament_used", 0) or 0
            filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
            await db.link_print_spool(job_id, body.spool_id, filament_g)

        if start_ts and end_ts:
            start_dt = datetime.fromtimestamp(start_ts, tz=timezone.utc)
            end_dt = datetime.fromtimestamp(end_ts, tz=timezone.utc)
        else:
            end_dt = datetime.now(timezone.utc)
            start_dt = end_dt - timedelta(seconds=duration_s or 3600)

        # Fetch actual HA prices + wattage over the print duration
        avg_watts = await ha.avg_power_over(start_dt, end_dt)
        avg_price = await ha.avg_price_over(start_dt, end_dt)

        # Fallback to recent avg if HA has no history that far back
        if avg_watts < 1:
            avg_watts = await ha.avg_power_over(
                end_dt - timedelta(hours=27), end_dt
            )
        if avg_price < 0.001:
            avg_price = await ha.avg_price_hours(27)

        energy_kwh = avg_watts * (duration_s / 3600) / 1000
        cost_electricity = round(energy_kwh * avg_price, 4)
        cost_filament = round(filament_g * spool["cost_per_gram"], 4)
        cost_total = round(cost_filament + cost_electricity, 4)

        # Delete old InfluxDB point (if any) and write updated one
        influx.delete_print_job(end_dt, filename)
        influx.write_print_job(
            timestamp=end_dt,
            filename=filename,
            spool_id=body.spool_id,
            material=spool["material"],
            duration_s=duration_s,
            filament_g=filament_g,
            avg_watts=round(avg_watts, 1),
            avg_eur_per_kwh=round(avg_price, 4),
            cost_electricity=cost_electricity,
            cost_filament=cost_filament,
            cost_total=cost_total,
            job_id=job_id,
        )
    except Exception as exc:
        logging.getLogger(__name__).error("assign_spool cost recalc failed for %s: %s", job_id, exc)

    return {"job_id": job_id, "spool_id": body.spool_id}


@router.post("/{job_id}/recalculate")
async def recalculate_cost(job_id: str) -> dict[str, Any]:
    """Recalculate cost for a print job using its existing spool assignment."""
    existing = await db.get_print_spool(job_id)
    if not existing or not existing.get("spool_id"):
        raise HTTPException(400, "No spool assigned — assign a spool first")
    spool_id = existing["spool_id"]
    body = SpoolAssign(spool_id=spool_id)
    return await assign_spool(job_id, body)


@router.post("/{job_id}/restore")
async def restore_costs(job_id: str) -> dict[str, Any]:
    """Recalculate and restore InfluxDB cost data for a print from HA history.

    Works without a spool — electricity only. Filament cost stays 0 unless a spool is assigned.
    Safe to run for any completed print, even if InfluxDB entry was lost or corrupted.
    """
    job_data = await moonraker.get("/server/history/job", uid=job_id)
    job = job_data.get("job", {})
    if not job:
        raise HTTPException(404, "Job not found")

    filename: str = job.get("filename", "")
    start_ts: float = job.get("start_time", 0)
    end_ts: float = job.get("end_time", 0)
    duration_s: float = job.get("print_duration", 0)
    filament_mm: float = job.get("filament_used", 0) or 0.0
    filament_g = round(filament_mm * _MM_TO_GRAMS, 2)

    if start_ts and end_ts:
        start_dt = datetime.fromtimestamp(start_ts, tz=timezone.utc)
        end_dt = datetime.fromtimestamp(end_ts, tz=timezone.utc)
    else:
        raise HTTPException(422, "Job missing start_time / end_time")

    avg_watts = await ha.avg_power_over(start_dt, end_dt)
    avg_price = await ha.avg_price_over(start_dt, end_dt)
    if avg_watts < 1:
        avg_watts = await ha.avg_power_over(end_dt - timedelta(hours=27), end_dt)
    if avg_price < 0.001:
        avg_price = await ha.avg_price_hours(27)

    energy_kwh = avg_watts * (duration_s / 3600) / 1000
    cost_electricity = round(energy_kwh * avg_price, 4)

    # Spool info (if any) for filament cost
    existing = await db.get_print_spool(job_id)
    spool_id = existing["spool_id"] if existing else None
    cost_per_gram = 0.0
    material = None
    if spool_id:
        spools = await db.list_spools()
        spool = next((s for s in spools if s["id"] == spool_id), None)
        if spool:
            cost_per_gram = spool["cost_per_gram"]
            material = spool["material"]

    cost_filament = round(filament_g * cost_per_gram, 4)
    cost_total = round(cost_electricity + cost_filament, 4)

    influx.delete_print_job(end_dt, filename)
    influx.write_print_job(
        timestamp=end_dt,
        filename=filename,
        spool_id=spool_id,
        material=material,
        duration_s=duration_s,
        filament_g=filament_g,
        avg_watts=round(avg_watts, 1),
        avg_eur_per_kwh=round(avg_price, 4),
        cost_electricity=cost_electricity,
        cost_filament=cost_filament,
        cost_total=cost_total,
        job_id=job_id,
    )

    log = logging.getLogger(__name__)
    log.info("restore: %s cost=€%.4f (%.1fW, %.4f€/kWh)", job_id, cost_total, avg_watts, avg_price)
    return {
        "job_id": job_id,
        "avg_watts": round(avg_watts, 1),
        "avg_eur_per_kwh": round(avg_price, 4),
        "cost_electricity": cost_electricity,
        "cost_filament": cost_filament,
        "cost_total": cost_total,
    }
