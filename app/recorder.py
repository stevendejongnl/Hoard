import asyncio
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from app import db, ha
from app.config import settings
from app.gcode_meta import extract_gcode_meta
from app.influx import influx
from app.moonraker import moonraker
from app.sse import hub

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


async def _record_print(job: dict[str, Any], skip_settle: bool = False) -> None:
    job_id: str = job.get("job_id", "")
    filename: str = job.get("filename", "")
    start_ts: float = job.get("start_time", 0)
    end_ts: float = job.get("end_time", 0)

    if not job_id or not filename:
        log.warning("recorder: missing job_id or filename, skipping")
        return

    if skip_settle:
        log.info("recorder: restoring historical costs for %s", filename)
    else:
        log.info("recorder: print finished %s, waiting %ds for HA sensors to settle", filename, _HA_SETTLE_DELAY)
        await asyncio.sleep(_HA_SETTLE_DELAY)

    start_dt = datetime.fromtimestamp(start_ts, tz=UTC)
    end_dt = datetime.fromtimestamp(end_ts, tz=UTC) if end_ts else datetime.now(UTC)
    duration_s = (end_dt - start_dt).total_seconds()

    # Get filament weight from gcode metadata (slicer-provided, most accurate)
    filament_g = 0.0
    try:
        meta = await moonraker.get_file_metadata(filename)
        filament_g = float(meta.get("filament_weight_total", 0) or 0)
    except Exception as exc:
        log.warning("recorder: metadata fetch failed for %s: %s", filename, exc)

    # Try exact energy delta first (long-term statistics, works for all history)
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

    # Costs
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
            job_id=job_id,
        )
        log.info("recorder: wrote print_job %s cost=€%.4f", filename, cost_total)
    except Exception as exc:
        log.error("recorder: influx write failed: %s", exc)
        return

    await db.link_print_spool(job_id, spool_id, filament_g)
    # Keep project_prints stats in sync so projects auto-update without manual refresh
    await db.refresh_project_prints_stats(job_id, duration_s, filament_g, cost_total)

    # Extract and store gcode metadata while file is still on printer
    try:
        gcode_meta = await extract_gcode_meta(filename)
        if gcode_meta:
            await db.update_print_job(job_id, {"gcode_meta": json.dumps(gcode_meta)})
            log.info("recorder: stored gcode_meta for %s (%d fields)", filename, len(gcode_meta))
    except Exception as exc:
        log.warning("recorder: gcode_meta extraction failed for %s: %s", filename, exc)

    await hub.broadcast("history_updated", {"job_id": job_id, "filename": filename})

    # Best-effort webcam snapshot — errors must never block the completion flow
    asyncio.create_task(_try_webcam_snapshot(job_id))


async def _try_webcam_snapshot(job_id: str) -> None:
    """Fetch a webcam snapshot and store it as a print photo. Errors are logged only."""
    try:
        data = await moonraker.get("/server/webcams/list")
        cams = data.get("webcams", [])
        if not cams:
            return
        cam = cams[0]
        snapshot_url: str = cam.get("snapshot_url", "")
        if not snapshot_url:
            return
        # Resolve relative URLs to Moonraker base
        if snapshot_url.startswith("/"):
            snapshot_url = moonraker._client_base() + snapshot_url

        async with httpx.AsyncClient() as client:
            resp = await client.get(snapshot_url, timeout=10)
            resp.raise_for_status()
            image_bytes = resp.content

        ts = int(time.time())
        filename = f"webcam_{ts}.jpg"
        data_dir = Path(settings.database_path).parent
        photo_dir = data_dir / "photos" / job_id
        photo_dir.mkdir(parents=True, exist_ok=True)
        (photo_dir / filename).write_bytes(image_bytes)

        await db.add_print_photo(job_id, filename, source="webcam")
        log.info("recorder: saved webcam snapshot for %s → %s", job_id, filename)
    except Exception as exc:
        log.warning("recorder: webcam snapshot failed for %s: %s", job_id, exc)


async def startup_reconcile(lookback: int = 1000) -> None:
    """On startup, scan ALL print history and restore costs for any prints missing InfluxDB entries.

    Uses the cumulative energy sensor (long-term statistics) for historical accuracy.
    Runs concurrently (max 5 at a time) so a full backfill of 800+ prints takes a few minutes.
    """
    try:
        result = await moonraker.get("/server/history/list", limit=lookback, order="desc")
        jobs = [j for j in result.get("jobs", []) if j.get("status") == "completed"]
    except Exception as exc:
        log.warning("reconcile: failed to fetch Moonraker history: %s", exc)
        return

    if not jobs:
        return

    # Build a minute-bucket index of existing InfluxDB entries
    influx_records = influx.query_history(limit=lookback * 2)

    def _minute(iso: str) -> int:
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return int(dt.timestamp()) // 60
        except Exception:
            return 0

    # Index InfluxDB entries: (filename, minute) → {cost_filament, filament_g}
    influx_by_file_minute: dict[tuple[str, int], dict] = {}
    for r in influx_records:
        key = (r.get("filename", ""), _minute(r.get("time", "")))
        influx_by_file_minute[key] = r

    # Get all spool assignments so we can detect zero-filament-cost issues
    all_print_spools = {ps["job_id"]: ps for ps in await db._list_all_print_spools()}

    # Fetch current spools for cost lookup
    spools_by_id = {s["id"]: s for s in await db.list_spools()}

    needs_fix = []
    for job in jobs:
        job_id = job.get("job_id", "")
        filename = job.get("filename", "")
        end_ts = float(job.get("end_time") or 0)
        if not job_id or not filename or not end_ts:
            continue
        record_minute = int(end_ts) // 60
        influx_entry = None
        for d in range(-5, 6):
            e = influx_by_file_minute.get((filename, record_minute + d))
            if e:
                influx_entry = e
                break

        if not influx_entry:
            needs_fix.append(job)
            continue

        # Also fix if filament cost is zero but a priced spool is assigned
        cost_filament = float(influx_entry.get("cost_filament") or 0)
        filament_g = float(influx_entry.get("filament_g") or 0)
        if cost_filament == 0 and filament_g > 0.1:
            ps = all_print_spools.get(job_id)
            if ps and ps.get("spool_id"):
                spool = spools_by_id.get(ps["spool_id"])
                if spool and float(spool.get("cost_per_gram") or 0) > 0:
                    needs_fix.append(job)

    missing = needs_fix

    if not missing:
        log.info("reconcile: all %d prints have cost data — nothing to do", len(jobs))
        return

    log.info("reconcile: %d/%d prints missing cost data — starting backfill", len(missing), len(jobs))

    sem = asyncio.Semaphore(5)
    restored = 0
    errors = 0

    async def _restore_one(job: dict) -> None:
        nonlocal restored, errors
        async with sem:
            try:
                await _record_print(job, skip_settle=True)
                restored += 1
            except Exception as exc:
                log.warning("reconcile: failed %s: %s", job.get("job_id"), exc)
                errors += 1

    await asyncio.gather(*[_restore_one(j) for j in missing])

    log.info("reconcile: complete — %d restored, %d errors (out of %d missing)", restored, errors, len(missing))


async def _recalculate_spool_prints(spool_id: int) -> None:
    """Recalculate InfluxDB cost entries for all prints using a specific spool.

    Triggered when a spool's cost_per_gram is updated.
    """
    try:
        all_ps = await db._list_all_print_spools()
        job_ids = [ps["job_id"] for ps in all_ps if ps.get("spool_id") == spool_id]
        if not job_ids:
            return
        log.info("spool cost update: recalculating %d prints for spool %d", len(job_ids), spool_id)
        sem = asyncio.Semaphore(3)
        done = 0

        async def _fix_one(job_id: str) -> None:
            nonlocal done
            async with sem:
                try:
                    job_data = await moonraker.get("/server/history/job", uid=job_id)
                    job = job_data.get("job", {})
                    if job:
                        await _record_print(job, skip_settle=True)
                        done += 1
                except Exception as exc:
                    log.warning("spool recalc: failed %s: %s", job_id, exc)

        await asyncio.gather(*[_fix_one(jid) for jid in job_ids])
        log.info("spool cost update: recalculated %d/%d prints", done, len(job_ids))
    except Exception as exc:
        log.warning("spool cost update failed: %s", exc)


async def periodic_reconcile(interval_s: int = 300) -> None:
    """Run a quick reconcile every N seconds covering the last 20 prints.

    Catches prints whose costs were missed due to WS disconnect at print-end time.
    Runs forever in the background; errors are logged and retried next interval.
    """
    await asyncio.sleep(60)  # give startup_reconcile time to finish first
    while True:
        try:
            await startup_reconcile(lookback=20)
        except Exception as exc:
            log.warning("periodic_reconcile error: %s", exc)
        await asyncio.sleep(interval_s)


def register_ws_handlers() -> None:
    moonraker.on("notify_history_changed", handle_history_changed)
