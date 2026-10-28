import asyncio
import json
import logging
import math
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, NamedTuple

from app import cache, db, ha
from app.config import settings
from app.gcode_meta import extract_gcode_meta
from app.influx import influx
from app.moonraker import moonraker
from app.sse import hub

log = logging.getLogger(__name__)

_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001

# Delay before querying HA history — gives power sensors time to settle
_HA_SETTLE_DELAY = 30

_MINUTES_AROUND_PRINT_END = 5
_RECENT_HOURS = 27


class PrintCosts(NamedTuple):
    duration_seconds: float
    filament_grams: float
    average_watts: float
    average_price: float
    electricity: float
    filament: float
    total: float
    spool_id: int | None
    material: str | None


def _minute_of(iso_timestamp: str) -> int:
    try:
        moment = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        return int(moment.timestamp()) // 60
    except Exception:
        return 0


def _index_by_file_and_minute(influx_records: list[dict]) -> dict[tuple[str, int], dict]:
    """Index InfluxDB entries: (filename, minute) → {cost_filament, filament_g}."""
    return {(record.get("filename", ""), _minute_of(record.get("time", ""))): record for record in influx_records}


def _find_influx_entry(index: dict[tuple[str, int], dict], filename: str, end_timestamp: float) -> dict | None:
    end_minute = int(end_timestamp) // 60
    for offset in range(-_MINUTES_AROUND_PRINT_END, _MINUTES_AROUND_PRINT_END + 1):
        entry = index.get((filename, end_minute + offset))
        if entry:
            return entry
    return None


def _recorded_filament_grams(influx_entry: dict, job: dict) -> float:
    """Grams from InfluxDB, or from the Moonraker filament length when InfluxDB has none."""
    grams = float(influx_entry.get("filament_g") or 0)
    if grams > 0.1:
        return grams
    return round(float(job.get("filament_used") or 0) * _MM_TO_GRAMS, 2)


def _end_times_by_job(jobs: list[dict]) -> dict[str, int]:
    return {job["job_id"]: int(job["end_time"]) for job in jobs if job.get("job_id") and job.get("end_time")}


class PrintRecorder:
    """Records the cost of finished prints in InfluxDB and the database, and backfills the ones that were missed."""

    def __init__(
        self,
        *,
        moonraker_client: Any = moonraker,
        influx_client: Any = influx,
        event_hub: Any = hub,
        home_assistant: Any = ha,
        database: Any = db,
        cache_store: Any = cache,
        gcode_meta_extractor: Callable[[str], Awaitable[dict | None]] = extract_gcode_meta,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        start_task: Callable[[Any], Any] = asyncio.create_task,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        epoch_seconds: Callable[[], float] = time.time,
        app_settings: Any = settings,
        http_client_factory: Callable[[], Any] | None = None,
    ) -> None:
        self._moonraker = moonraker_client
        self._influx = influx_client
        self._hub = event_hub
        self._home_assistant = home_assistant
        self._database = database
        self._cache = cache_store
        self._extract_gcode_meta = gcode_meta_extractor
        self._sleep = sleep
        self._start_task = start_task
        self._now = now
        self._epoch_seconds = epoch_seconds
        self._settings = app_settings
        self._http_client_factory = http_client_factory

    # ── One print ─────────────────────────────────────────────────────────────

    async def record_print(self, job: dict[str, Any], skip_settle: bool = False) -> None:
        job_id: str = job.get("job_id", "")
        filename: str = job.get("filename", "")
        if not job_id or not filename:
            log.warning("recorder: missing job_id or filename, skipping")
            return

        await self._wait_for_sensors(filename, skip_settle)
        start_dt, end_dt = self._print_window(job)
        costs = await self._calculate_costs(filename, start_dt, end_dt)

        if not await self._write_to_influx(job_id, filename, end_dt, costs):
            return

        await self._store_in_database(job, costs)
        await self._store_gcode_meta(job_id, filename)
        await self._hub.broadcast("history_updated", {"job_id": job_id, "filename": filename})

        # Best-effort webcam snapshot — only for real-time completions, not reconcile backfill
        if not skip_settle:
            self._start_task(self.take_webcam_snapshot(job_id))

    async def _wait_for_sensors(self, filename: str, skip_settle: bool) -> None:
        if skip_settle:
            log.info("recorder: restoring historical costs for %s", filename)
            return
        log.info("recorder: print finished %s, waiting %ds for HA sensors to settle", filename, _HA_SETTLE_DELAY)
        await self._sleep(_HA_SETTLE_DELAY)

    def _print_window(self, job: dict[str, Any]) -> tuple[datetime, datetime]:
        start_timestamp: float = job.get("start_time", 0)
        end_timestamp: float = job.get("end_time", 0)
        start_dt = datetime.fromtimestamp(start_timestamp, tz=UTC)
        end_dt = datetime.fromtimestamp(end_timestamp, tz=UTC) if end_timestamp else self._now()
        return start_dt, end_dt

    async def _filament_grams(self, filename: str) -> float:
        """Filament weight from the gcode metadata (slicer-provided, most accurate)."""
        try:
            metadata = await self._moonraker.get_file_metadata(filename)
            return float(metadata.get("filament_weight_total", 0) or 0)
        except Exception as exc:
            log.warning("recorder: metadata fetch failed for %s: %s", filename, exc)
            return 0.0

    async def _energy_and_power(
        self, start_dt: datetime, end_dt: datetime, duration_seconds: float
    ) -> tuple[float | None, float]:
        """The exact energy delta (long-term statistics, works for all history) and the average watts."""
        energy_kwh = await self._home_assistant.energy_used_kwh(start_dt, end_dt)
        if energy_kwh is not None and energy_kwh > 0:
            watts = round(energy_kwh * 1000 / (duration_seconds / 3600), 1) if duration_seconds > 0 else 0.0
            return energy_kwh, watts
        watts = await self._home_assistant.avg_power_over(start_dt, end_dt)
        if watts < 1:
            watts = await self._home_assistant.avg_power_over(end_dt - timedelta(hours=_RECENT_HOURS), end_dt)
        return None, watts

    async def _average_price(self, start_dt: datetime, end_dt: datetime) -> float:
        price = await self._home_assistant.avg_price_over(start_dt, end_dt)
        if price < 0.001:
            return await self._home_assistant.avg_price_hours(_RECENT_HOURS)
        return price

    async def _calculate_costs(self, filename: str, start_dt: datetime, end_dt: datetime) -> PrintCosts:
        duration_seconds = (end_dt - start_dt).total_seconds()
        filament_grams = await self._filament_grams(filename)
        energy_kwh, average_watts = await self._energy_and_power(start_dt, end_dt, duration_seconds)
        average_price = await self._average_price(start_dt, end_dt)
        if energy_kwh is None:
            energy_kwh = average_watts * (duration_seconds / 3600) / 1000

        electricity = round(energy_kwh * average_price, 4)
        spool = await self._database.get_active_spool()
        cost_per_gram = spool["cost_per_gram"] if spool else 0.0
        filament = round(filament_grams * cost_per_gram, 4)
        return PrintCosts(
            duration_seconds=duration_seconds,
            filament_grams=filament_grams,
            average_watts=average_watts,
            average_price=average_price,
            electricity=electricity,
            filament=filament,
            total=round(electricity + filament, 4),
            spool_id=spool["id"] if spool else None,
            material=spool["material"] if spool else None,
        )

    async def _write_to_influx(self, job_id: str, filename: str, end_dt: datetime, costs: PrintCosts) -> bool:
        try:
            await self._influx.write_print_job(
                timestamp=end_dt,
                filename=filename,
                spool_id=costs.spool_id,
                material=costs.material,
                duration_s=costs.duration_seconds,
                filament_g=costs.filament_grams,
                avg_watts=costs.average_watts,
                avg_eur_per_kwh=costs.average_price,
                cost_electricity=costs.electricity,
                cost_filament=costs.filament,
                cost_total=costs.total,
                job_id=job_id,
            )
        except Exception as exc:
            log.error("recorder: influx write failed: %s", exc)
            return False
        log.info("recorder: wrote print_job %s cost=€%.4f", filename, costs.total)
        return True

    async def _store_in_database(self, job: dict[str, Any], costs: PrintCosts) -> None:
        job_id: str = job["job_id"]
        end_timestamp: float = job.get("end_time", 0)
        await self._cache.invalidate_prefix("history:")
        await self._cache.invalidate(f"print:{job_id}")
        await self._database.link_print_spool(job_id, costs.spool_id, costs.filament_grams)
        # Keep project_prints stats in sync so projects auto-update without manual refresh
        await self._database.refresh_project_prints_stats(
            job_id, costs.duration_seconds, costs.filament_grams, costs.total
        )
        # Store end_time so we can detect stale webcam photos from reconcile runs
        if end_timestamp:
            await self._database.set_print_end_time(job_id, int(end_timestamp))

    async def _store_gcode_meta(self, job_id: str, filename: str) -> None:
        """Extract and store gcode metadata while the file is still on the printer."""
        try:
            gcode_meta = await self._extract_gcode_meta(filename)
            if gcode_meta is None:
                return
            await self._database.update_print_job(job_id, {"gcode_meta": json.dumps(gcode_meta)})
            log.info("recorder: stored gcode_meta for %s (%d fields)", filename, len(gcode_meta))
        except Exception as exc:
            log.warning("recorder: gcode_meta extraction failed for %s: %s", filename, exc)

    # ── Webcam snapshot ───────────────────────────────────────────────────────

    async def take_webcam_snapshot(self, job_id: str) -> None:
        """Fetch a webcam snapshot and store it as a print photo. Errors are logged only."""
        try:
            snapshot_url = await self._webcam_snapshot_url()
            if not snapshot_url:
                return
            image_bytes = await self._download_snapshot(snapshot_url)
            filename = self._save_snapshot(job_id, image_bytes)
            await self._database.add_print_photo(job_id, filename, source="webcam")
            log.info("recorder: saved webcam snapshot for %s → %s", job_id, filename)
        except Exception as exc:
            log.warning("recorder: webcam snapshot failed for %s: %s", job_id, exc)

    async def _webcam_snapshot_url(self) -> str:
        data = await self._moonraker.get("/server/webcams/list")
        webcams = data.get("webcams", [])
        if not webcams:
            return ""
        snapshot_url: str = webcams[0].get("snapshot_url", "")
        # Resolve relative URLs to Moonraker base
        if snapshot_url.startswith("/"):
            return self._moonraker._client_base() + snapshot_url
        return snapshot_url

    def _open_printer_client(self) -> Any:
        """The HTTP client for the printer's host: the injected one, or the guarded client of Moonraker."""
        return (self._http_client_factory or self._moonraker.http_client)()

    async def _download_snapshot(self, snapshot_url: str) -> bytes:
        async with self._open_printer_client() as client:
            response = await client.get(snapshot_url, timeout=10)
            response.raise_for_status()
            return response.content

    def _save_snapshot(self, job_id: str, image_bytes: bytes) -> str:
        filename = f"webcam_{int(self._epoch_seconds())}.jpg"
        photo_directory = Path(self._settings.database_path).parent / "photos" / job_id
        photo_directory.mkdir(parents=True, exist_ok=True)
        (photo_directory / filename).write_bytes(image_bytes)
        return filename

    # ── Reconcile ─────────────────────────────────────────────────────────────

    async def startup_reconcile(self, lookback: int = 1000) -> None:
        """On startup, scan ALL print history and restore costs for any prints missing InfluxDB entries.

        Uses the cumulative energy sensor (long-term statistics) for historical accuracy.
        Runs concurrently (max 5 at a time) so a full backfill of 800+ prints takes a few minutes.
        """
        jobs = await self._fetch_completed_jobs(lookback)
        if not jobs:
            return

        influx_index = _index_by_file_and_minute(await self._influx.query_history(limit=lookback * 2))
        missing = await self._jobs_missing_cost_data(jobs, influx_index)

        # Bulk-store end_time for all historical prints so cleanup can detect stale photos
        await self._database.bulk_set_print_end_times(_end_times_by_job(jobs))
        await self._remove_stale_webcam_photos()

        if not missing:
            log.info("reconcile: all %d prints have cost data — nothing to do", len(jobs))
            return
        log.info("reconcile: %d/%d prints missing cost data — starting backfill", len(missing), len(jobs))
        await self._backfill(missing)

    async def _fetch_completed_jobs(self, lookback: int) -> list[dict] | None:
        try:
            result = await self._moonraker.get("/server/history/list", limit=lookback, order="desc")
            return [job for job in result.get("jobs", []) if job.get("status") == "completed"]
        except Exception as exc:
            log.warning("reconcile: failed to fetch Moonraker history: %s", exc)
            return None

    async def _jobs_missing_cost_data(self, jobs: list[dict], influx_index: dict[tuple[str, int], dict]) -> list[dict]:
        # Spool assignments let us detect zero-filament-cost issues
        print_spools = {entry["job_id"]: entry for entry in await self._database._list_all_print_spools()}
        spools_by_id = {spool["id"]: spool for spool in await self._database.list_spools()}
        return [job for job in jobs if self._lacks_cost_data(job, influx_index, print_spools, spools_by_id)]

    @staticmethod
    def _lacks_cost_data(job: dict, influx_index: dict, print_spools: dict, spools_by_id: dict) -> bool:
        filename = job.get("filename", "")
        end_timestamp = float(job.get("end_time") or 0)
        if not job.get("job_id") or not filename or not end_timestamp:
            return False
        influx_entry = _find_influx_entry(influx_index, filename, end_timestamp)
        if not influx_entry:
            return True
        # Also fix if filament cost is zero but a priced spool is assigned
        if float(influx_entry.get("cost_filament") or 0) != 0:
            return False
        if _recorded_filament_grams(influx_entry, job) <= 0.1:
            return False
        spool_id = (print_spools.get(job["job_id"]) or {}).get("spool_id")
        spool = spools_by_id.get(spool_id) if spool_id else None
        if not spool:
            return False
        return float(spool.get("cost_per_gram") or 0) > 0

    async def _remove_stale_webcam_photos(self) -> None:
        """Remove webcam photos taken during previous reconcile runs (captured long after print ended)."""
        deleted = await self._database.cleanup_stale_webcam_photos(grace_s=3600)
        if deleted:
            log.info("reconcile: removed %d stale webcam photo(s) from previous reconcile runs", deleted)

    async def _backfill(self, missing: list[dict]) -> None:
        semaphore = asyncio.Semaphore(5)
        outcome = {"restored": 0, "errors": 0}

        async def restore_one(job: dict) -> None:
            async with semaphore:
                try:
                    await self.record_print(job, skip_settle=True)
                    outcome["restored"] += 1
                except Exception as exc:
                    log.warning("reconcile: failed %s: %s", job.get("job_id"), exc)
                    outcome["errors"] += 1

        await asyncio.gather(*[restore_one(job) for job in missing])
        log.info(
            "reconcile: complete — %d restored, %d errors (out of %d missing)",
            outcome["restored"],
            outcome["errors"],
            len(missing),
        )

    async def recalculate_spool_prints(self, spool_id: int) -> None:
        """Recalculate InfluxDB cost entries for all prints using a specific spool.

        Triggered when a spool's cost_per_gram is updated.
        """
        try:
            print_spools = await self._database._list_all_print_spools()
            job_ids = [entry["job_id"] for entry in print_spools if entry.get("spool_id") == spool_id]
            if not job_ids:
                return
            log.info("spool cost update: recalculating %d prints for spool %d", len(job_ids), spool_id)
            semaphore = asyncio.Semaphore(3)
            done = {"count": 0}

            async def fix_one(job_id: str) -> None:
                async with semaphore:
                    await self._recalculate_one(job_id, done)

            await asyncio.gather(*[fix_one(job_id) for job_id in job_ids])
            log.info("spool cost update: recalculated %d/%d prints", done["count"], len(job_ids))
        except Exception as exc:
            log.warning("spool cost update failed: %s", exc)

    async def _recalculate_one(self, job_id: str, done: dict[str, int]) -> None:
        try:
            job_data = await self._moonraker.get("/server/history/job", uid=job_id)
            job = job_data.get("job", {})
            if not job:
                return
            await self.record_print(job, skip_settle=True)
            done["count"] += 1
        except Exception as exc:
            log.warning("spool recalc: failed %s: %s", job_id, exc)

    async def periodic_reconcile(self, interval_s: int = 300) -> None:
        """Run a quick reconcile every N seconds covering the last 20 prints.

        Catches prints whose costs were missed due to WS disconnect at print-end time.
        Runs forever in the background; errors are logged and retried next interval.
        """
        await self._sleep(60)  # give startup_reconcile time to finish first
        while True:
            try:
                await self.startup_reconcile(lookback=20)
            except Exception as exc:
                log.warning("periodic_reconcile error: %s", exc)
            await self._sleep(interval_s)


print_recorder = PrintRecorder()


async def handle_history_changed(params: list[Any]) -> None:
    """Called by Moonraker WS on notify_history_changed."""
    if not params:
        return
    event = params[0] if isinstance(params[0], dict) else {}
    if event.get("action") != "added":
        return
    job = event.get("job", {})
    asyncio.create_task(_record_print(job))


async def _record_print(job: dict[str, Any], skip_settle: bool = False) -> None:
    await print_recorder.record_print(job, skip_settle)


async def _try_webcam_snapshot(job_id: str) -> None:
    await print_recorder.take_webcam_snapshot(job_id)


async def startup_reconcile(lookback: int = 1000) -> None:
    await print_recorder.startup_reconcile(lookback)


async def _recalculate_spool_prints(spool_id: int) -> None:
    await print_recorder.recalculate_spool_prints(spool_id)


async def periodic_reconcile(interval_s: int = 300) -> None:
    await print_recorder.periodic_reconcile(interval_s)


def register_ws_handlers() -> None:
    moonraker.on("notify_history_changed", handle_history_changed)
