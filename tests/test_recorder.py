import json
from datetime import UTC, datetime
from typing import Any

import pytest

from app import recorder

START = 1_700_000_000
END = START + 3600


class Journal:
    """Every call that the recorder makes on one of its collaborators, in order."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple, dict]] = []

    def record(self, name: str, *arguments: Any, **keywords: Any) -> None:
        self.calls.append((name, arguments, keywords))

    def named(self, name: str) -> list[tuple[tuple, dict]]:
        return [(arguments, keywords) for call, arguments, keywords in self.calls if call == name]


class FakeMoonraker:
    def __init__(self, journal: Journal) -> None:
        self.journal = journal
        self.metadata: dict[str, Any] | Exception = {"filament_weight_total": 10.0}
        self.history_jobs: list[dict[str, Any]] | Exception = []

    async def get_file_metadata(self, filename: str) -> dict[str, Any]:
        if isinstance(self.metadata, Exception):
            raise self.metadata
        return self.metadata

    async def get(self, path: str, **params: Any) -> Any:
        self.journal.record("moonraker.get", path, **params)
        if path == "/server/history/list":
            if isinstance(self.history_jobs, Exception):
                raise self.history_jobs
            return {"jobs": self.history_jobs}
        return {"webcams": []}

    def _client_base(self) -> str:
        return "http://printer"


class FakeHomeAssistant:
    def __init__(self, journal: Journal) -> None:
        self.journal = journal
        self.energy: float | None = 0.5
        self.watts: list[float] = [0.0]
        self.price_over: float = 0.30
        self.price_hours: float = 0.25

    async def energy_used_kwh(self, start, end):
        return self.energy

    async def avg_power_over(self, start, end):
        self.journal.record("ha.avg_power_over", start, end)
        return self.watts.pop(0) if len(self.watts) > 1 else self.watts[0]

    async def avg_price_over(self, start, end):
        return self.price_over

    async def avg_price_hours(self, hours):
        self.journal.record("ha.avg_price_hours", hours)
        return self.price_hours


class FakeInflux:
    def __init__(self, journal: Journal) -> None:
        self.journal = journal
        self.fail = False
        self.records: list[dict[str, Any]] = []

    async def write_print_job(self, **fields: Any) -> None:
        if self.fail:
            raise RuntimeError("influx down")
        self.journal.record("influx.write_print_job", **fields)

    async def query_history(self, limit: int):
        return self.records


class FakeDatabase:
    def __init__(self, journal: Journal) -> None:
        self.journal = journal
        self.active_spool: dict[str, Any] | None = {"id": 7, "material": "PLA", "cost_per_gram": 0.02}
        self.print_spools: list[dict[str, Any]] = []
        self.spools: list[dict[str, Any]] = []
        self.stale_photos = 0

    async def get_active_spool(self):
        return self.active_spool

    async def link_print_spool(self, job_id, spool_id, filament_g):
        self.journal.record("db.link_print_spool", job_id, spool_id, filament_g)

    async def refresh_project_prints_stats(self, job_id, duration_s, filament_g, cost_total):
        self.journal.record("db.refresh_project_prints_stats", job_id, duration_s, filament_g, cost_total)

    async def set_print_end_time(self, job_id, end_time):
        self.journal.record("db.set_print_end_time", job_id, end_time)

    async def update_print_job(self, job_id, fields):
        self.journal.record("db.update_print_job", job_id, fields)

    async def _list_all_print_spools(self):
        return self.print_spools

    async def list_spools(self):
        return self.spools

    async def bulk_set_print_end_times(self, end_times):
        self.journal.record("db.bulk_set_print_end_times", end_times)

    async def cleanup_stale_webcam_photos(self, grace_s):
        self.journal.record("db.cleanup_stale_webcam_photos", grace_s=grace_s)
        return self.stale_photos


class FakeCache:
    def __init__(self, journal: Journal) -> None:
        self.journal = journal

    async def invalidate_prefix(self, prefix):
        self.journal.record("cache.invalidate_prefix", prefix)

    async def invalidate(self, key):
        self.journal.record("cache.invalidate", key)


class FakeHub:
    def __init__(self, journal: Journal) -> None:
        self.journal = journal

    async def broadcast(self, event, data):
        self.journal.record("hub.broadcast", event, data)


class World:
    def __init__(self) -> None:
        self.journal = Journal()
        self.moonraker = FakeMoonraker(self.journal)
        self.home_assistant = FakeHomeAssistant(self.journal)
        self.influx = FakeInflux(self.journal)
        self.database = FakeDatabase(self.journal)
        self.cache = FakeCache(self.journal)
        self.hub = FakeHub(self.journal)
        self.gcode_meta: dict[str, Any] | None | Exception = None
        self.slept: list[float] = []
        self.started_tasks: list[str] = []

    async def extract_gcode_meta(self, filename: str):
        if isinstance(self.gcode_meta, Exception):
            raise self.gcode_meta
        return self.gcode_meta

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)

    def create_task(self, coroutine):
        self.started_tasks.append(coroutine.cr_code.co_name)
        coroutine.close()


def build_recorder(world: World) -> recorder.PrintRecorder:
    return recorder.PrintRecorder(
        moonraker_client=world.moonraker,
        influx_client=world.influx,
        event_hub=world.hub,
        home_assistant=world.home_assistant,
        database=world.database,
        cache_store=world.cache,
        gcode_meta_extractor=world.extract_gcode_meta,
        sleep=world.sleep,
        start_task=world.create_task,
        now=lambda: datetime.fromtimestamp(END, tz=UTC),
    )


def completed_job(job_id: str = "job1", filename: str = "benchy.gcode", **overrides: Any) -> dict[str, Any]:
    job = {"job_id": job_id, "filename": filename, "start_time": START, "end_time": END, "status": "completed"}
    return job | overrides


async def test_a_print_with_exact_energy_is_costed_from_the_energy_and_the_spool_price() -> None:
    world = World()
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)

    ((_, written),) = world.journal.named("influx.write_print_job")
    assert written == {
        "timestamp": datetime.fromtimestamp(END, tz=UTC),
        "filename": "benchy.gcode",
        "spool_id": 7,
        "material": "PLA",
        "duration_s": 3600.0,
        "filament_g": 10.0,
        "avg_watts": 500.0,
        "avg_eur_per_kwh": 0.30,
        "cost_electricity": 0.15,
        "cost_filament": 0.2,
        "cost_total": 0.35,
        "job_id": "job1",
    }
    assert [name for name, _, _ in world.journal.calls] == [
        "influx.write_print_job",
        "cache.invalidate_prefix",
        "cache.invalidate",
        "db.link_print_spool",
        "db.refresh_project_prints_stats",
        "db.set_print_end_time",
        "hub.broadcast",
    ]
    assert world.journal.named("cache.invalidate_prefix") == [(("history:",), {})]
    assert world.journal.named("cache.invalidate") == [(("print:job1",), {})]
    assert world.journal.named("db.link_print_spool") == [(("job1", 7, 10.0), {})]
    assert world.journal.named("db.refresh_project_prints_stats") == [(("job1", 3600.0, 10.0, 0.35), {})]
    assert world.journal.named("db.set_print_end_time") == [(("job1", END), {})]
    assert world.journal.named("hub.broadcast") == [
        (("history_updated", {"job_id": "job1", "filename": "benchy.gcode"}), {})
    ]
    assert world.slept == []
    assert world.started_tasks == []


async def test_a_live_print_waits_for_the_sensors_and_takes_a_webcam_snapshot() -> None:
    world = World()
    target = build_recorder(world)
    await target.record_print(completed_job())
    assert world.slept == [30]
    assert world.started_tasks == ["take_webcam_snapshot"]


async def test_without_exact_energy_the_average_power_and_the_recent_price_are_the_fallback() -> None:
    world = World()
    world.home_assistant.energy = None
    world.home_assistant.watts = [0.5, 200.0]
    world.home_assistant.price_over = 0.0
    world.home_assistant.price_hours = 0.25
    world.database.active_spool = None
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)

    ((_, written),) = world.journal.named("influx.write_print_job")
    assert written["avg_watts"] == 200.0
    assert written["avg_eur_per_kwh"] == 0.25
    assert written["cost_electricity"] == 0.05
    assert (written["spool_id"], written["material"], written["cost_filament"]) == (None, None, 0.0)
    assert world.journal.named("ha.avg_price_hours") == [((27,), {})]
    assert len(world.journal.named("ha.avg_power_over")) == 2
    assert world.journal.named("db.link_print_spool") == [(("job1", None, 10.0), {})]


async def test_zero_exact_energy_counts_as_no_energy() -> None:
    world = World()
    world.home_assistant.energy = 0.0
    world.home_assistant.watts = [100.0]
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)
    ((_, written),) = world.journal.named("influx.write_print_job")
    assert written["avg_watts"] == 100.0
    assert written["cost_electricity"] == 0.03


async def test_a_failed_metadata_fetch_gives_zero_filament() -> None:
    world = World()
    world.moonraker.metadata = RuntimeError("no metadata")
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)
    ((_, written),) = world.journal.named("influx.write_print_job")
    assert (written["filament_g"], written["cost_filament"]) == (0.0, 0.0)


async def test_a_failed_influx_write_stops_before_anything_else_is_stored() -> None:
    world = World()
    world.influx.fail = True
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)
    assert world.journal.calls == []


async def test_a_job_without_an_id_or_filename_is_skipped() -> None:
    world = World()
    target = build_recorder(world)
    await target.record_print({"job_id": "", "filename": "a.gcode"}, skip_settle=True)
    await target.record_print({"job_id": "x", "filename": ""}, skip_settle=True)
    assert world.journal.calls == []


async def test_the_gcode_metadata_is_stored_as_json_before_the_broadcast() -> None:
    world = World()
    world.gcode_meta = {"layer_height": 0.2}
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)
    assert world.journal.named("db.update_print_job") == [
        (("job1", {"gcode_meta": json.dumps({"layer_height": 0.2})}), {})
    ]
    names = [name for name, _, _ in world.journal.calls]
    assert names.index("db.update_print_job") < names.index("hub.broadcast")


async def test_a_failing_gcode_metadata_extraction_does_not_stop_the_broadcast() -> None:
    world = World()
    world.gcode_meta = RuntimeError("boom")
    target = build_recorder(world)
    await target.record_print(completed_job(), skip_settle=True)
    assert world.journal.named("db.update_print_job") == []
    assert len(world.journal.named("hub.broadcast")) == 1


async def test_a_job_without_an_end_time_does_not_store_an_end_time() -> None:
    world = World()
    target = build_recorder(world)
    await target.record_print(completed_job(end_time=0), skip_settle=True)
    assert world.journal.named("db.set_print_end_time") == []
    assert len(world.journal.named("influx.write_print_job")) == 1


# ── startup_reconcile ─────────────────────────────────────────────────────────


def influx_record(job: dict[str, Any], minute_offset: int = 0, **fields: Any) -> dict[str, Any]:
    moment = datetime.fromtimestamp(job["end_time"] + minute_offset * 60, tz=UTC).isoformat().replace("+00:00", "Z")
    return {"filename": job["filename"], "time": moment, "cost_filament": 0.2, "filament_g": 10.0} | fields


async def test_a_failing_history_fetch_ends_the_reconcile() -> None:
    world = World()
    world.moonraker.history_jobs = RuntimeError("down")
    target = build_recorder(world)
    await target.startup_reconcile()
    assert world.journal.calls == [("moonraker.get", ("/server/history/list",), {"limit": 1000, "order": "desc"})]


async def test_only_completed_jobs_are_reconciled() -> None:
    world = World()
    world.moonraker.history_jobs = [completed_job(status="cancelled")]
    target = build_recorder(world)
    await target.startup_reconcile()
    assert world.journal.named("db.bulk_set_print_end_times") == []


async def test_when_every_print_has_cost_data_only_the_end_times_are_stored() -> None:
    world = World()
    job = completed_job()
    world.moonraker.history_jobs = [
        job,
        completed_job(job_id="no_end", end_time=0),
        completed_job(job_id="", filename="x"),
    ]
    world.influx.records = [influx_record(job, minute_offset=5)]
    world.database.stale_photos = 2
    target = build_recorder(world)
    await target.startup_reconcile(lookback=50)
    assert world.journal.named("db.bulk_set_print_end_times") == [(({"job1": END},), {})]
    assert world.journal.named("db.cleanup_stale_webcam_photos") == [((), {"grace_s": 3600})]
    assert world.journal.named("influx.write_print_job") == []


async def test_an_influx_entry_six_minutes_away_does_not_count() -> None:
    world = World()
    job = completed_job()
    world.moonraker.history_jobs = [job]
    world.influx.records = [influx_record(job, minute_offset=6)]
    target = build_recorder(world)
    await target.startup_reconcile()
    assert len(world.journal.named("influx.write_print_job")) == 1


async def test_a_print_without_an_influx_entry_is_backfilled_without_waiting() -> None:
    world = World()
    world.moonraker.history_jobs = [completed_job()]
    target = build_recorder(world)
    await target.startup_reconcile()
    assert len(world.journal.named("influx.write_print_job")) == 1
    assert world.slept == []
    assert world.started_tasks == []


async def test_a_print_with_zero_filament_cost_and_a_priced_spool_is_backfilled() -> None:
    world = World()
    job = completed_job() | {"filament_used": 4000}
    world.moonraker.history_jobs = [job]
    world.influx.records = [influx_record(job, cost_filament=0, filament_g=0)]
    world.database.print_spools = [{"job_id": "job1", "spool_id": 7}]
    world.database.spools = [{"id": 7, "cost_per_gram": 0.02}]
    target = build_recorder(world)
    await target.startup_reconcile()
    assert len(world.journal.named("influx.write_print_job")) == 1


@pytest.mark.parametrize(
    ("print_spools", "spools"),
    [
        ([], []),
        ([{"job_id": "job1", "spool_id": None}], []),
        ([{"job_id": "job1", "spool_id": 7}], []),
        ([{"job_id": "job1", "spool_id": 7}], [{"id": 7, "cost_per_gram": 0}]),
    ],
)
async def test_zero_filament_cost_without_a_priced_spool_is_left_alone(print_spools, spools) -> None:
    world = World()
    job = completed_job() | {"filament_used": 4000}
    world.moonraker.history_jobs = [job]
    world.influx.records = [influx_record(job, cost_filament=0, filament_g=0)]
    world.database.print_spools = print_spools
    world.database.spools = spools
    target = build_recorder(world)
    await target.startup_reconcile()
    assert world.journal.named("influx.write_print_job") == []


async def test_zero_filament_cost_with_almost_no_filament_is_left_alone() -> None:
    world = World()
    job = completed_job() | {"filament_used": 0}
    world.moonraker.history_jobs = [job]
    world.influx.records = [influx_record(job, cost_filament=0, filament_g=0.05)]
    world.database.print_spools = [{"job_id": "job1", "spool_id": 7}]
    world.database.spools = [{"id": 7, "cost_per_gram": 0.02}]
    target = build_recorder(world)
    await target.startup_reconcile()
    assert world.journal.named("influx.write_print_job") == []
