import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

# Delay before querying HA history — gives power sensors time to settle
_HA_SETTLE_DELAY = 30


async def handle_history_changed(params: list[Any]) -> None:
    """Called by Moonraker WS on notify_history_changed."""
    if not params:
        return
    event = params[0] if isinstance(params[0], dict) else {}
    if event.get("action") != "added":
        return
    job = event.get("job", {})
    # Run in background so WS handler returns immediately
    asyncio.create_task(_record_print(job))


async def _record_print(job: dict[str, Any]) -> None:
    from app import db, ha
    from app.influx import influx
    from app.moonraker import moonraker
    from app.sse import hub

    job_id: str = job.get("job_id", "")
    filename: str = job.get("filename", "")
    start_ts: float = job.get("start_time", 0)
    end_ts: float = job.get("end_time", 0)

    if not job_id or not filename:
        log.warning("recorder: missing job_id or filename, skipping")
        return

    log.info("recorder: print finished %s, waiting %ds for HA sensors to settle", filename, _HA_SETTLE_DELAY)
    await asyncio.sleep(_HA_SETTLE_DELAY)

    start_dt = datetime.fromtimestamp(start_ts, tz=timezone.utc)
    end_dt = datetime.fromtimestamp(end_ts, tz=timezone.utc) if end_ts else datetime.now(timezone.utc)
    duration_s = (end_dt - start_dt).total_seconds()

    # Get filament weight from gcode metadata (slicer-provided, most accurate)
    filament_g = 0.0
    try:
        meta = await moonraker.get_file_metadata(filename)
        filament_g = float(meta.get("filament_weight_total", 0) or 0)
    except Exception as exc:
        log.warning("recorder: metadata fetch failed for %s: %s", filename, exc)

    # HA historical averages — with fallback if exact window returns nothing
    from datetime import timedelta
    avg_watts = await ha.avg_power_over(start_dt, end_dt)
    avg_price = await ha.avg_price_over(start_dt, end_dt)
    if avg_watts < 1:
        avg_watts = await ha.avg_power_over(end_dt - timedelta(hours=27), end_dt)
    if avg_price < 0.001:
        avg_price = await ha.avg_price_hours(27)

    # Costs
    energy_kwh = avg_watts * (duration_s / 3600) / 1000
    cost_electricity = round(energy_kwh * avg_price, 4)

    active_spool = await db.get_active_spool()
    spool_id = active_spool["id"] if active_spool else None
    material = active_spool["material"] if active_spool else None
    cost_per_gram = active_spool["cost_per_gram"] if active_spool else 0.0
    cost_filament = round(filament_g * cost_per_gram, 4)
    cost_total = round(cost_electricity + cost_filament, 4)

    try:
        influx.write_print_job(
            timestamp=end_dt,
            filename=filename,
            spool_id=spool_id,
            material=material,
            duration_s=duration_s,
            filament_g=filament_g,
            avg_watts=avg_watts,
            avg_eur_per_kwh=avg_price,
            cost_electricity=cost_electricity,
            cost_filament=cost_filament,
            cost_total=cost_total,
        )
        log.info("recorder: wrote print_job %s cost=€%.4f", filename, cost_total)
    except Exception as exc:
        log.error("recorder: influx write failed: %s", exc)
        return

    await db.link_print_spool(job_id, spool_id, filament_g)
    await hub.broadcast("history_updated", {"job_id": job_id, "filename": filename})


def register_ws_handlers() -> None:
    from app.moonraker import moonraker
    moonraker.on("notify_history_changed", handle_history_changed)
