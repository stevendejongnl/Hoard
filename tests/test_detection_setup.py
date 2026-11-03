from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.db import Database
from app.detection_setup import build_detection_monitor

SNAPSHOT_URL = "http://hoard/api/webcams/0/snapshot"
PRINTING = {"state": "printing", "filename": "benchy.gcode"}


class StopTestError(Exception):
    """Raised by the fake sleep to end the loop."""


class FakeResponse:
    def __init__(self, body: Any = None, content: bytes = b"") -> None:
        self.body = body
        self.content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self.body


class FakeHttpClient:
    """Answers the detector with a score, and the camera with a frame."""

    def __init__(self, score: float = 0.9) -> None:
        self.score = score
        self.requests: list[tuple[str, dict[str, Any]]] = []

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exception_details: Any) -> None:
        return None

    async def get(self, url: str, **keywords: Any) -> FakeResponse:
        self.requests.append((url, keywords))
        if url.endswith("/p/"):
            return FakeResponse({"detections": [["failure", self.score, [1.0, 2.0, 3.0, 4.0]]]})
        return FakeResponse(content=b"jpeg-bytes")


class FakeHub:
    def __init__(self) -> None:
        self.announced: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, kind: str, data: dict[str, Any]) -> None:
        self.announced.append((kind, data))


class FakeMoonraker:
    def __init__(self) -> None:
        self.posted: list[str] = []

    async def post(self, path: str, **data: Any) -> dict:
        self.posted.append(path)
        return {}


class CountingSleep:
    def __init__(self, rounds: int) -> None:
        self.rounds = rounds
        self.count = 0

    async def __call__(self, seconds: float) -> None:
        self.count += 1
        if self.count >= self.rounds:
            raise StopTestError


@pytest.fixture
async def database(tmp_path: Path) -> Database:
    database = Database(str(tmp_path / "hoard.db"))
    await database.initialise()
    return database


def make_settings(tmp_path: Path, detector_url: str = "http://detector:3333") -> SimpleNamespace:
    return SimpleNamespace(
        detector_url=detector_url,
        detector_token="",
        detector_snapshot_url=SNAPSHOT_URL,
        uploads_dir=str(tmp_path / "uploads"),
    )


def build(tmp_path: Path, database: Database, rounds: int = 3, detector_url: str = "http://detector:3333"):
    client, hub, printer, notices = FakeHttpClient(), FakeHub(), FakeMoonraker(), []

    async def notify(title: str, body: str, url: str = "/") -> None:
        notices.append((title, body, url))

    monitor = build_detection_monitor(
        make_settings(tmp_path, detector_url),
        database,
        hub,
        notify,
        printer,
        lambda: PRINTING,
        http_client_factory=lambda: client,
        sleep=CountingSleep(rounds),
    )
    return monitor, client, hub, printer, notices


def test_without_a_detector_address_there_is_nothing_to_run(tmp_path: Path, database: Database):
    monitor, *_ = build(tmp_path, database, detector_url="")
    assert monitor is None


async def test_the_detector_is_asked_to_fetch_the_snapshot_address(tmp_path: Path, database: Database):
    monitor, client, *_ = build(tmp_path, database, rounds=1)
    assert monitor is not None
    with pytest.raises(StopTestError):
        await monitor.run()
    url, keywords = client.requests[0]
    assert (url, keywords["params"]) == ("http://detector:3333/p/", {"img": SNAPSHOT_URL})


async def test_a_print_that_keeps_looking_failed_is_saved_with_its_frame_and_the_owner_is_told(
    tmp_path: Path, database: Database
):
    monitor, _, hub, printer, notices = build(tmp_path, database, rounds=3)
    assert monitor is not None
    with pytest.raises(StopTestError):
        await monitor.run()
    [alert] = await database.list_detection_alerts()
    assert (alert["filename"], alert["has_frame"]) == ("benchy.gcode", True)
    assert (tmp_path / "uploads" / "detections" / f"{alert['id']}.jpg").read_bytes() == b"jpeg-bytes"
    assert len(notices) == 1
    assert printer.posted == []
    assert hub.announced[-1][1]["state"] == "alert"
    assert [fault["key"] for fault in monitor.faults()] == ["detection.failure"]


async def test_with_the_pause_action_the_printer_is_paused(tmp_path: Path, database: Database):
    await database.save_detection_settings({"action": "pause"})
    monitor, _, _, printer, _ = build(tmp_path, database, rounds=3)
    assert monitor is not None
    with pytest.raises(StopTestError):
        await monitor.run()
    assert printer.posted == ["/printer/print/pause"]
