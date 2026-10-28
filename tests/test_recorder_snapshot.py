from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from app import recorder
from tests.test_recorder import END, FakeDatabase, FakeMoonraker, Journal, World, build_recorder, completed_job


class FakeResponse:
    content = b"jpeg bytes"

    def raise_for_status(self) -> None:
        return None


class FakeHttpClient:
    def __init__(self, requested: list[str]) -> None:
        self.requested = requested

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exception_details: Any) -> None:
        return None

    async def get(self, url: str, timeout: float) -> FakeResponse:
        self.requested.append(url)
        return FakeResponse()


class SnapshotMoonraker(FakeMoonraker):
    def __init__(self, journal: Journal, webcams: list[dict[str, str]]) -> None:
        super().__init__(journal)
        self.webcams = webcams

    async def get(self, path: str, **params: Any) -> Any:
        return {"webcams": self.webcams}


class PhotoDatabase(FakeDatabase):
    async def add_print_photo(self, job_id, filename, source):
        self.journal.record("db.add_print_photo", job_id, filename, source=source)


async def take_snapshot(webcams: list[dict[str, str]], tmp_path) -> tuple[Journal, list[str]]:
    journal = Journal()
    database = PhotoDatabase(journal)
    requested: list[str] = []
    target = recorder.PrintRecorder(
        moonraker_client=SnapshotMoonraker(journal, webcams),
        database=database,
        http_client_factory=lambda: FakeHttpClient(requested),
        epoch_seconds=lambda: 1234.9,
        app_settings=SimpleNamespace(database_path=str(tmp_path / "hoard.db")),
    )
    await target.take_webcam_snapshot("job1")
    return journal, requested


async def test_a_relative_snapshot_url_is_resolved_against_moonraker_and_the_photo_is_stored(tmp_path) -> None:
    journal, requested = await take_snapshot([{"snapshot_url": "/webcam/snapshot"}], tmp_path)
    assert requested == ["http://printer/webcam/snapshot"]
    assert (tmp_path / "photos" / "job1" / "webcam_1234.jpg").read_bytes() == b"jpeg bytes"
    assert journal.named("db.add_print_photo") == [(("job1", "webcam_1234.jpg"), {"source": "webcam"})]


async def test_an_absolute_snapshot_url_is_used_as_it_is(tmp_path) -> None:
    _journal, requested = await take_snapshot([{"snapshot_url": "http://camera/snap"}], tmp_path)
    assert requested == ["http://camera/snap"]


async def test_no_webcam_or_no_snapshot_url_stores_no_photo(tmp_path) -> None:
    for webcams in ([], [{"stream_url": "/x"}]):
        journal, requested = await take_snapshot(webcams, tmp_path)
        assert requested == []
        assert journal.named("db.add_print_photo") == []


async def test_recalculating_a_spool_records_every_print_that_used_it() -> None:
    world = World()
    world.database.print_spools = [
        {"job_id": "a", "spool_id": 7},
        {"job_id": "b", "spool_id": 8},
        {"job_id": "c", "spool_id": 7},
    ]

    async def history_job(path: str, **params: Any) -> Any:
        return {"job": completed_job(job_id=params["uid"])} if params["uid"] == "a" else {"job": {}}

    world.moonraker.get = history_job  # type: ignore[method-assign]
    target = build_recorder(world)
    await target.recalculate_spool_prints(7)
    ((_, written),) = world.journal.named("influx.write_print_job")
    assert written["job_id"] == "a"
    assert written["timestamp"] == datetime.fromtimestamp(END, tz=UTC)
