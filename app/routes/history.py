import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import ModuleType
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import Database as SqliteDatabase
from app.influx import InfluxClient
from app.moonraker import MoonrakerClient
from app.routes.dependencies import Cache, Database, HomeAssistant, Influx, Moonraker

router = APIRouter(prefix="/api/history", tags=["history"])

# 1.75mm PLA filament: π × (0.875mm)² × 1.24 g/cm³ × 0.001 cm³/mm³
_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001

_COST_FIELDS = ("avg_watts", "avg_eur_per_kwh", "cost_electricity", "cost_filament", "cost_total")
_NEIGHBOUR_MINUTES = 5
_FALLBACK_HOURS = 27


@dataclass
class ElectricityUsage:
    energy_kwh: float
    avg_watts: float
    avg_eur_per_kwh: float


def _moonraker_to_record(job: dict[str, Any]) -> dict[str, Any]:
    filament_mm = job.get("filament_used", 0) or 0
    filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
    end_ts = job.get("end_time", 0) or 0
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


async def _fetch_costs(influx: InfluxClient, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    window = find_cost_window(jobs)
    if window is None:
        return []
    return await influx.query_history_between(*window)


async def _fetch_jobs(moonraker: MoonrakerClient, limit: int, offset: int) -> list[dict[str, Any]]:
    try:
        result = await moonraker.get("/server/history/list", limit=limit, start=offset, order="desc")
    except Exception as exc:
        raise HTTPException(502, "The printer cannot be reached") from exc
    return result.get("jobs", [])


async def _fetch_total(moonraker: MoonrakerClient, offset: int, jobs: list[dict[str, Any]]) -> int:
    try:
        totals = await moonraker.get("/server/history/totals")
        return int(totals.get("job_totals", {}).get("total_jobs", 0))
    except Exception:
        return offset + len(jobs)


def _influx_minute(iso: str) -> int:
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()) // 60
    except Exception:
        return 0


def _index_costs_by_file_and_minute(rows: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, Any]]:
    return {(row.get("filename", ""), _influx_minute(row.get("time", ""))): row for row in rows}


def _find_cost(costs: dict[tuple[str, int], dict[str, Any]], filename: str, minute: int) -> dict[str, Any] | None:
    """The cost of the print at its end minute, else the nearest one within five minutes (earlier first)."""
    cost = costs.get((filename, minute))
    if cost:
        return cost
    for distance in range(1, _NEIGHBOUR_MINUTES + 1):
        for neighbour in (minute - distance, minute + distance):
            cost = costs.get((filename, neighbour))
            if cost:
                return cost
    return None


def _describe_spool(print_spool: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": print_spool.get("spool_id"),
        "brand": print_spool.get("brand"),
        "material": print_spool.get("material"),
        "color": print_spool.get("color"),
        "color_hex": print_spool.get("color_hex"),
    }


def _apply_cost(record: dict[str, Any], cost: dict[str, Any]) -> None:
    for field in _COST_FIELDS:
        record[field] = cost.get(field)
    record["_source"] = "influx"


async def _attach_relations(
    database: SqliteDatabase,
    record: dict[str, Any],
    costs: dict[tuple[str, int], dict[str, Any]],
    end_timestamp: int,
) -> None:
    cost = _find_cost(costs, record["filename"], int(end_timestamp) // 60)
    if cost:
        _apply_cost(record, cost)
    print_spool = await database.get_print_spool(record["job_id"])
    if print_spool:
        record["spool"] = _describe_spool(print_spool)
    project = await database.get_project_for_job(record["job_id"])
    if project:
        record["project"] = {"id": project["id"], "name": project["name"]}


async def _attach_detail_counts(database: SqliteDatabase, records: list[dict[str, Any]]) -> None:
    detail_counts = await database.get_print_detail_counts([record["job_id"] for record in records])
    for record in records:
        counts = detail_counts.get(record["job_id"], {"has_detail": False, "photo_count": 0})
        record["has_detail"] = counts["has_detail"]
        record["photo_count"] = counts["photo_count"]


async def _build_page(
    moonraker: MoonrakerClient, influx: InfluxClient, database: SqliteDatabase, limit: int, offset: int
) -> dict[str, Any]:
    jobs = await _fetch_jobs(moonraker, limit, offset)
    total = await _fetch_total(moonraker, offset, jobs)
    completed = [job for job in jobs if job.get("status") == "completed"]
    records = [_moonraker_to_record(job) for job in completed]
    costs = _index_costs_by_file_and_minute(await _fetch_costs(influx, jobs))
    for record, job in zip(records, completed, strict=True):
        await _attach_relations(database, record, costs, job.get("end_time", 0) or 0)
    await _attach_detail_counts(database, records)
    return {"records": records, "total": total, "limit": limit, "offset": offset}


@router.get("")
async def list_history(
    moonraker: Moonraker, influx: Influx, database: Database, cache: Cache, limit: int = 20, offset: int = 0
) -> dict[str, Any]:
    ttl = 60 if offset == 0 else 86400

    async def fetch_page() -> dict[str, Any]:
        return await _build_page(moonraker, influx, database, limit, offset)

    return await cache.get_or_set(f"history:{limit}:{offset}", fetch_page, ttl=ttl)


class SpoolAssign(BaseModel):
    spool_id: int


def _read_job_window(job: dict[str, Any], duration_s: float) -> tuple[datetime, datetime]:
    """Start and end of a job; a job without both timestamps ends now and started `duration_s` ago."""
    start_timestamp = job.get("start_time", 0)
    end_timestamp = job.get("end_time", 0)
    if start_timestamp and end_timestamp:
        return datetime.fromtimestamp(start_timestamp, tz=UTC), datetime.fromtimestamp(end_timestamp, tz=UTC)
    end = datetime.now(UTC)
    return end - timedelta(seconds=duration_s or 3600), end


async def _measure_average_watts(home_assistant: ModuleType, start: datetime, end: datetime) -> float:
    watts = await home_assistant.avg_power_over(start, end)
    if watts >= 1:
        return watts
    return await home_assistant.avg_power_over(end - timedelta(hours=_FALLBACK_HOURS), end)


async def _measure_average_price(home_assistant: ModuleType, start: datetime, end: datetime) -> float:
    price = await home_assistant.avg_price_over(start, end)
    if price >= 0.001:
        return price
    return await home_assistant.avg_price_hours(_FALLBACK_HOURS)


async def _measure_electricity(
    home_assistant: ModuleType, start: datetime, end: datetime, duration_s: float
) -> ElectricityUsage:
    """Exact energy delta first, the average of the power sensor when there is none."""
    energy_kwh = await home_assistant.energy_used_kwh(start, end)
    if energy_kwh is not None and energy_kwh > 0:
        watts = round(energy_kwh * 1000 / (duration_s / 3600), 1) if duration_s > 0 else 0.0
    else:
        watts = await _measure_average_watts(home_assistant, start, end)
        energy_kwh = watts * (duration_s / 3600) / 1000
    price = await _measure_average_price(home_assistant, start, end)
    return ElectricityUsage(energy_kwh=energy_kwh, avg_watts=watts, avg_eur_per_kwh=price)


async def _write_costs(
    influx: InfluxClient,
    *,
    end: datetime,
    filename: str,
    job_id: str,
    spool_id: int | None,
    material: str | None,
    duration_s: float,
    filament_g: float,
    usage: ElectricityUsage,
    cost_per_gram: float,
) -> dict[str, Any]:
    """Replace the InfluxDB point of a print by one with the new costs; returns the costs."""
    cost_electricity = round(usage.energy_kwh * usage.avg_eur_per_kwh, 4)
    cost_filament = round(filament_g * cost_per_gram, 4)
    costs = {
        "avg_watts": round(usage.avg_watts, 1),
        "avg_eur_per_kwh": round(usage.avg_eur_per_kwh, 4),
        "cost_electricity": cost_electricity,
        "cost_filament": cost_filament,
        "cost_total": round(cost_filament + cost_electricity, 4),
    }
    await influx.delete_print_job(end, filename)
    await influx.write_print_job(
        timestamp=end,
        filename=filename,
        spool_id=spool_id,
        material=material,
        duration_s=duration_s,
        filament_g=filament_g,
        job_id=job_id,
        **costs,
    )
    return costs


async def _recalculate_costs(
    moonraker: MoonrakerClient,
    influx: InfluxClient,
    database: SqliteDatabase,
    home_assistant: ModuleType,
    job_id: str,
    spool: dict[str, Any],
    filament_g: float,
) -> None:
    job = (await moonraker.get("/server/history/job", uid=job_id)).get("job", {})
    duration_s = job.get("print_duration", 0)
    if not filament_g:
        filament_g = round((job.get("filament_used", 0) or 0) * _MM_TO_GRAMS, 2)
        await database.link_print_spool(job_id, spool["id"], filament_g)
    start, end = _read_job_window(job, duration_s)
    usage = await _measure_electricity(home_assistant, start, end, duration_s)
    await _write_costs(
        influx,
        end=end,
        filename=job.get("filename", job_id),
        job_id=job_id,
        spool_id=spool["id"],
        material=spool["material"],
        duration_s=duration_s,
        filament_g=filament_g,
        usage=usage,
        cost_per_gram=spool["cost_per_gram"],
    )


async def _find_spool(database: SqliteDatabase, spool_id: int) -> dict[str, Any] | None:
    return next((spool for spool in await database.list_spools() if spool["id"] == spool_id), None)


async def _invalidate_print(cache: ModuleType, job_id: str) -> None:
    await cache.invalidate_prefix("history:")
    await cache.invalidate(f"print:{job_id}")


@router.patch("/{job_id}/spool")
async def assign_spool(
    job_id: str,
    body: SpoolAssign,
    moonraker: Moonraker,
    influx: Influx,
    database: Database,
    cache: Cache,
    home_assistant: HomeAssistant,
) -> dict[str, Any]:
    spool = await _find_spool(database, body.spool_id)
    if not spool:
        raise HTTPException(404, "Spool not found")
    existing = await database.get_print_spool(job_id)
    filament_g = existing["filament_used_g"] if existing else 0
    await database.link_print_spool(job_id, body.spool_id, filament_g)
    try:
        await _recalculate_costs(moonraker, influx, database, home_assistant, job_id, spool, filament_g)
    except Exception as exc:
        logging.getLogger(__name__).error("assign_spool cost recalc failed for %s: %s", job_id, exc)
    await _invalidate_print(cache, job_id)
    return {"job_id": job_id, "spool_id": body.spool_id}


@router.post("/{job_id}/recalculate")
async def recalculate_cost(
    job_id: str,
    moonraker: Moonraker,
    influx: Influx,
    database: Database,
    cache: Cache,
    home_assistant: HomeAssistant,
) -> dict[str, Any]:
    """Recalculate cost for a print job using its existing spool assignment."""
    existing = await database.get_print_spool(job_id)
    if not existing or not existing.get("spool_id"):
        raise HTTPException(400, "No spool assigned — assign a spool first")
    body = SpoolAssign(spool_id=existing["spool_id"])
    return await assign_spool(job_id, body, moonraker, influx, database, cache, home_assistant)


async def _read_spool_pricing(database: SqliteDatabase, job_id: str) -> tuple[int | None, str | None, float]:
    """Spool id, material and cost per gram of the spool of a print; no spool costs nothing."""
    existing = await database.get_print_spool(job_id)
    spool_id = existing["spool_id"] if existing else None
    if not spool_id:
        return None, None, 0.0
    spool = await _find_spool(database, spool_id)
    if not spool:
        return spool_id, None, 0.0
    return spool_id, spool["material"], spool["cost_per_gram"]


@router.post("/{job_id}/restore")
async def restore_costs(
    job_id: str,
    moonraker: Moonraker,
    influx: Influx,
    database: Database,
    cache: Cache,
    home_assistant: HomeAssistant,
) -> dict[str, Any]:
    """Recalculate and restore InfluxDB cost data for a print from HA history.

    Works without a spool — electricity only. Filament cost stays 0 unless a spool is assigned.
    Safe to run for any completed print, even if InfluxDB entry was lost or corrupted.
    """
    job = (await moonraker.get("/server/history/job", uid=job_id)).get("job", {})
    if not job:
        raise HTTPException(404, "Job not found")
    if not (job.get("start_time", 0) and job.get("end_time", 0)):
        raise HTTPException(422, "Job missing start_time / end_time")
    duration_s: float = job.get("print_duration", 0)
    start, end = _read_job_window(job, duration_s)
    usage = await _measure_electricity(home_assistant, start, end, duration_s)
    spool_id, material, cost_per_gram = await _read_spool_pricing(database, job_id)
    costs = await _write_costs(
        influx,
        end=end,
        filename=job.get("filename", ""),
        job_id=job_id,
        spool_id=spool_id,
        material=material,
        duration_s=duration_s,
        filament_g=round((job.get("filament_used", 0) or 0.0) * _MM_TO_GRAMS, 2),
        usage=usage,
        cost_per_gram=cost_per_gram,
    )
    await _invalidate_print(cache, job_id)
    logging.getLogger(__name__).info(
        "restore: %s cost=€%.4f (%.1fkWh @ €%.4f/kWh)",
        job_id,
        costs["cost_total"],
        usage.energy_kwh,
        usage.avg_eur_per_kwh,
    )
    return {"job_id": job_id, **costs}
