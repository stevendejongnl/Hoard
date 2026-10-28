import logging
import math
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import cache, db, ha
from app.influx import influx
from app.moonraker import moonraker

router = APIRouter(prefix="/api/history", tags=["history"])

# 1.75mm PLA filament: π × (0.875mm)² × 1.24 g/cm³ × 0.001 cm³/mm³
_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001


def _moonraker_to_record(job: dict[str, Any]) -> dict[str, Any]:
    filament_mm = job.get("filament_used", 0) or 0
    filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
    end_ts = job.get("end_time", 0) or 0
    job.get("start_time", 0) or 0
    return {
        "job_id": job.get("job_id", ""),
        "filename": job.get("filename", ""),
        "time": datetime.fromtimestamp(end_ts, tz=UTC).isoformat().replace("+00:00", "Z") if end_ts else None,
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


COST_WINDOW_MARGIN = timedelta(minutes=6)


def find_cost_window(jobs: list[dict[str, Any]]) -> tuple[datetime, datetime] | None:
    """The period in which the cost records of these jobs lie: from the first to the last end time, plus a margin."""
    end_times = [job["end_time"] for job in jobs if job.get("status") == "completed" and job.get("end_time")]
    if not end_times:
        return None
    first = datetime.fromtimestamp(min(end_times), UTC)
    last = datetime.fromtimestamp(max(end_times), UTC)
    return first - COST_WINDOW_MARGIN, last + COST_WINDOW_MARGIN


async def _fetch_costs(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    window = find_cost_window(jobs)
    if window is None:
        return []
    return await influx.query_history_between(*window)


async def _fetch_jobs(limit: int, offset: int) -> list[dict[str, Any]]:
    try:
        result = await moonraker.get("/server/history/list", limit=limit, start=offset, order="desc")
    except Exception as exc:
        raise HTTPException(502, "The printer cannot be reached") from exc
    return result.get("jobs", [])


async def _fetch_total(offset: int, jobs: list[dict[str, Any]]) -> int:
    try:
        totals = await moonraker.get("/server/history/totals")
        return int(totals.get("job_totals", {}).get("total_jobs", 0))
    except Exception:
        return offset + len(jobs)


@router.get("")
async def list_history(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    ttl = 60 if offset == 0 else 86400
    cache_key = f"history:{limit}:{offset}"

    async def _fetch() -> dict[str, Any]:
        jobs = await _fetch_jobs(limit, offset)
        total = await _fetch_total(offset, jobs)

        records = [_moonraker_to_record(j) for j in jobs if j.get("status") == "completed"]

        influx_all = await _fetch_costs(jobs)

        def _influx_minute(iso: str) -> int:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                return int(dt.timestamp()) // 60
            except Exception:
                return 0

        influx_by_file_minute: dict[tuple[str, int], dict[str, Any]] = {}
        for r in influx_all:
            key = (r.get("filename", ""), _influx_minute(r.get("time", "")))
            influx_by_file_minute[key] = r

        for record in records:
            filename = record["filename"]
            job_id = record["job_id"]

            end_ts = next((j.get("end_time", 0) for j in jobs if j.get("job_id") == job_id), 0) or 0
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

            ps = await db.get_print_spool(job_id)
            if ps:
                record["spool"] = {
                    "id": ps.get("spool_id"),
                    "brand": ps.get("brand"),
                    "material": ps.get("material"),
                    "color": ps.get("color"),
                    "color_hex": ps.get("color_hex"),
                }

            proj = await db.get_project_for_job(job_id)
            if proj:
                record["project"] = {"id": proj["id"], "name": proj["name"]}

        job_ids = [r["job_id"] for r in records]
        detail_counts = await db.get_print_detail_counts(job_ids)
        for record in records:
            counts = detail_counts.get(record["job_id"], {"has_detail": False, "photo_count": 0})
            record["has_detail"] = counts["has_detail"]
            record["photo_count"] = counts["photo_count"]

        return {"records": records, "total": total, "limit": limit, "offset": offset}

    return await cache.get_or_set(cache_key, _fetch, ttl=ttl)


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
            start_dt = datetime.fromtimestamp(start_ts, tz=UTC)
            end_dt = datetime.fromtimestamp(end_ts, tz=UTC)
        else:
            end_dt = datetime.now(UTC)
            start_dt = end_dt - timedelta(seconds=duration_s or 3600)

        # Try exact energy delta first, fall back to power-sensor average
        energy_kwh = await ha.energy_used_kwh(start_dt, end_dt)
        avg_watts = 0.0
        if energy_kwh is not None and energy_kwh > 0:
            avg_watts = round(energy_kwh * 1000 / (duration_s / 3600), 1) if duration_s > 0 else 0.0
        else:
            energy_kwh = None
            avg_watts = await ha.avg_power_over(start_dt, end_dt)
            if avg_watts < 1:
                avg_watts = await ha.avg_power_over(end_dt - timedelta(hours=27), end_dt)

        avg_price = await ha.avg_price_over(start_dt, end_dt)
        if avg_price < 0.001:
            avg_price = await ha.avg_price_hours(27)

        if energy_kwh is None:
            energy_kwh = avg_watts * (duration_s / 3600) / 1000
        cost_electricity = round(energy_kwh * avg_price, 4)
        cost_filament = round(filament_g * spool["cost_per_gram"], 4)
        cost_total = round(cost_filament + cost_electricity, 4)

        # Delete old InfluxDB point (if any) and write updated one
        await influx.delete_print_job(end_dt, filename)
        await influx.write_print_job(
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

    await cache.invalidate_prefix("history:")
    await cache.invalidate(f"print:{job_id}")
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
        start_dt = datetime.fromtimestamp(start_ts, tz=UTC)
        end_dt = datetime.fromtimestamp(end_ts, tz=UTC)
    else:
        raise HTTPException(422, "Job missing start_time / end_time")

    # Try exact energy delta first (uses long-term statistics, works for all history)
    energy_kwh = await ha.energy_used_kwh(start_dt, end_dt)
    avg_watts = 0.0
    if energy_kwh is not None and energy_kwh > 0:
        avg_watts = round(energy_kwh * 1000 / (duration_s / 3600), 1) if duration_s > 0 else 0.0
    else:
        # Fallback: time-weighted average of power sensor (only recent history)
        energy_kwh = None
        avg_watts = await ha.avg_power_over(start_dt, end_dt)
        if avg_watts < 1:
            avg_watts = await ha.avg_power_over(end_dt - timedelta(hours=27), end_dt)

    avg_price = await ha.avg_price_over(start_dt, end_dt)
    if avg_price < 0.001:
        avg_price = await ha.avg_price_hours(27)

    if energy_kwh is None:
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

    await influx.delete_print_job(end_dt, filename)
    await influx.write_print_job(
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

    await cache.invalidate_prefix("history:")
    await cache.invalidate(f"print:{job_id}")
    log = logging.getLogger(__name__)
    log.info("restore: %s cost=€%.4f (%.1fkWh @ €%.4f/kWh)", job_id, cost_total, energy_kwh, avg_price)
    return {
        "job_id": job_id,
        "avg_watts": round(avg_watts, 1),
        "avg_eur_per_kwh": round(avg_price, 4),
        "cost_electricity": cost_electricity,
        "cost_filament": cost_filament,
        "cost_total": cost_total,
    }
