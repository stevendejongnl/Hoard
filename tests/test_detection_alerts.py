from pathlib import Path

import pytest

from app.db import Database
from app.detection_alerts import DetectionAlertStore
from app.detectors import Detection
from app.spaghetti_watch import FailureReport

DETECTION = Detection("failure", 0.82, (1.0, 2.0, 3.0, 4.0))
REPORT = FailureReport("benchy.gcode", 0.82, [DETECTION])


@pytest.fixture
async def database(tmp_path: Path) -> Database:
    database = Database(str(tmp_path / "hoard.db"))
    await database.initialise()
    return database


class FakeCamera:
    def __init__(self, frame: bytes = b"jpeg-bytes") -> None:
        self.frame = frame
        self.failure: Exception | None = None

    async def __call__(self) -> bytes:
        if self.failure:
            raise self.failure
        return self.frame


class Clock:
    def __init__(self, now: int = 1000) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def make_store(database: Database, tmp_path: Path, camera: FakeCamera | None = None, clock: Clock | None = None):
    return DetectionAlertStore(database, tmp_path / "frames", camera or FakeCamera(), clock or Clock())


async def test_a_saved_alert_has_its_print_score_boxes_and_time(database: Database, tmp_path: Path):
    alert_id = await make_store(database, tmp_path).save(REPORT)
    stored = await database.get_detection_alert(alert_id)
    assert stored is not None
    assert (stored["filename"], stored["score"], stored["created_at"], stored["verdict"]) == (
        "benchy.gcode",
        0.82,
        1000,
        None,
    )
    assert stored["detections"] == [{"label": "failure", "score": 0.82, "box": [1.0, 2.0, 3.0, 4.0]}]


async def test_the_camera_frame_is_kept_next_to_the_alert(database: Database, tmp_path: Path):
    store = make_store(database, tmp_path)
    alert_id = await store.save(REPORT)
    frame = store.frame_path(alert_id)
    assert frame is not None
    assert frame.read_bytes() == b"jpeg-bytes"
    stored = await database.get_detection_alert(alert_id)
    assert stored is not None and stored["has_frame"] is True


async def test_an_alert_is_kept_when_the_frame_cannot_be_fetched(database: Database, tmp_path: Path):
    camera = FakeCamera()
    camera.failure = RuntimeError("camera does not answer")
    store = make_store(database, tmp_path, camera)
    alert_id = await store.save(REPORT)
    assert store.frame_path(alert_id) is None
    stored = await database.get_detection_alert(alert_id)
    assert stored is not None and stored["has_frame"] is False


async def test_a_missing_alert_is_none(database: Database):
    assert await database.get_detection_alert(99) is None


async def test_alerts_list_newest_first(database: Database, tmp_path: Path):
    clock = Clock(1000)
    store = make_store(database, tmp_path, clock=clock)
    first = await store.save(REPORT)
    clock.now = 2000
    second = await store.save(REPORT)
    assert [alert["id"] for alert in await database.list_detection_alerts()] == [second, first]


async def test_verdicts_are_set_for_several_alerts_at_once(database: Database, tmp_path: Path):
    store = make_store(database, tmp_path)
    ids = [await store.save(REPORT) for _ in range(3)]
    await database.set_detection_verdicts(ids[:2], "false_alarm")
    verdicts = {alert["id"]: alert["verdict"] for alert in await database.list_detection_alerts()}
    assert verdicts == {ids[0]: "false_alarm", ids[1]: "false_alarm", ids[2]: None}


async def test_a_verdict_can_be_taken_back(database: Database, tmp_path: Path):
    alert_id = await make_store(database, tmp_path).save(REPORT)
    await database.set_detection_verdicts([alert_id], "real")
    await database.set_detection_verdicts([alert_id], None)
    stored = await database.get_detection_alert(alert_id)
    assert stored is not None and stored["verdict"] is None


async def test_alerts_can_be_listed_by_verdict(database: Database, tmp_path: Path):
    store = make_store(database, tmp_path)
    real, unlabelled = await store.save(REPORT), await store.save(REPORT)
    await database.set_detection_verdicts([real], "real")
    assert [alert["id"] for alert in await database.list_detection_alerts(verdict="real")] == [real]
    assert [alert["id"] for alert in await database.list_detection_alerts(verdict="unlabelled")] == [unlabelled]


async def test_pruning_keeps_the_newest_alerts_and_deletes_the_frames_of_the_rest(database: Database, tmp_path: Path):
    clock = Clock(1000)
    store = make_store(database, tmp_path, clock=clock)
    old = await store.save(REPORT)
    clock.now = 2000
    new = await store.save(REPORT)
    await store.prune(keep=1)
    assert [alert["id"] for alert in await database.list_detection_alerts()] == [new]
    assert store.frame_path(old) is None
    assert store.frame_path(new) is not None
