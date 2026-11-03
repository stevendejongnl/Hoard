from dataclasses import replace
from typing import Any

import pytest

from app.detection_settings import DetectionSettings
from app.detectors import Detection, DetectorUnavailableError
from app.spaghetti_watch import FailureReport, PrintWatcher, WatchStatus

SNAPSHOT_URL = "http://hoard/api/webcams/0/snapshot"
PRINTING = {"state": "printing", "filename": "benchy.gcode"}
SETTINGS = DetectionSettings(threshold=0.5, window_size=3, required_frames=2)


class FakeDetector:
    def __init__(self, scores: list[float]) -> None:
        self.scores = list(scores)
        self.asked: list[str] = []
        self.unavailable = False

    async def detect(self, snapshot_url: str) -> list[Detection]:
        self.asked.append(snapshot_url)
        if self.unavailable:
            raise DetectorUnavailableError("down")
        return [Detection("failure", self.scores.pop(0), (1.0, 2.0, 3.0, 4.0))]


class FakeSettingsSource:
    def __init__(self, settings: DetectionSettings = SETTINGS) -> None:
        self.settings = settings

    async def __call__(self) -> DetectionSettings:
        return self.settings


class FakeResponder:
    def __init__(self) -> None:
        self.reports: list[FailureReport] = []
        self.failure: Exception | None = None

    async def __call__(self, report: FailureReport) -> None:
        self.reports.append(report)
        if self.failure:
            raise self.failure


def make_watcher(
    scores: list[float], settings: FakeSettingsSource | None = None
) -> tuple[PrintWatcher, FakeDetector, FakeResponder]:
    detector = FakeDetector(scores)
    responder = FakeResponder()
    watcher = PrintWatcher(detector, SNAPSHOT_URL, settings or FakeSettingsSource(), responder)
    return watcher, detector, responder


async def test_without_a_print_nothing_is_judged():
    watcher, detector, _ = make_watcher([])
    assert await watcher.check({"state": "standby"}) == WatchStatus("idle")
    assert detector.asked == []


async def test_a_disabled_detection_judges_nothing_during_a_print():
    watcher, detector, _ = make_watcher([], FakeSettingsSource(replace(SETTINGS, enabled=False)))
    assert await watcher.check(PRINTING) == WatchStatus("off")
    assert detector.asked == []


async def test_during_a_print_the_camera_image_is_judged_and_its_score_shown():
    watcher, detector, _ = make_watcher([0.2])
    assert await watcher.check(PRINTING) == WatchStatus("watching", score=0.2)
    assert detector.asked == [SNAPSHOT_URL]


async def test_one_bad_frame_does_not_raise_an_alert():
    watcher, _, responder = make_watcher([0.9, 0.1, 0.1])
    for _ in range(3):
        await watcher.check(PRINTING)
    assert responder.reports == []


async def test_enough_bad_frames_raise_one_alert_with_the_score_and_the_boxes():
    watcher, _, responder = make_watcher([0.9, 0.8, 0.95])
    statuses = [await watcher.check(PRINTING) for _ in range(3)]
    assert [status.state for status in statuses] == ["watching", "alert", "alert"]
    [report] = responder.reports
    assert report.filename == "benchy.gcode"
    assert report.score == 0.8
    assert report.detections == [Detection("failure", 0.8, (1.0, 2.0, 3.0, 4.0))]


async def test_a_detector_that_is_down_is_shown_and_scores_nothing():
    watcher, detector, responder = make_watcher([])
    detector.unavailable = True
    assert await watcher.check(PRINTING) == WatchStatus("unavailable")
    assert responder.reports == []


async def test_a_paused_print_is_not_judged_and_keeps_its_alert():
    watcher, detector, _ = make_watcher([0.9, 0.9])
    await watcher.check(PRINTING)
    await watcher.check(PRINTING)
    detector.asked.clear()
    assert (await watcher.check({"state": "paused", "filename": "benchy.gcode"})).state == "alert"
    assert detector.asked == []


async def test_a_paused_print_without_an_alert_is_idle():
    watcher, _, _ = make_watcher([])
    assert (await watcher.check({"state": "paused", "filename": "benchy.gcode"})).state == "idle"


async def test_the_next_print_can_raise_an_alert_again():
    watcher, _, responder = make_watcher([0.9, 0.9, 0.9, 0.9])
    for _ in range(2):
        await watcher.check(PRINTING)
    await watcher.check({"state": "complete", "filename": "benchy.gcode"})
    for _ in range(2):
        await watcher.check(PRINTING)
    assert len(responder.reports) == 2


async def test_frames_of_an_earlier_print_do_not_count_in_the_next_one():
    watcher, _, responder = make_watcher([0.9, 0.1, 0.9])
    await watcher.check(PRINTING)
    await watcher.check({"state": "complete", "filename": "benchy.gcode"})
    await watcher.check(PRINTING)
    await watcher.check(PRINTING)
    assert responder.reports == []


async def test_changed_settings_apply_to_the_next_frame():
    source = FakeSettingsSource(replace(SETTINGS, required_frames=3, window_size=3))
    watcher, _, responder = make_watcher([0.9, 0.9, 0.9], source)
    await watcher.check(PRINTING)
    await watcher.check(PRINTING)
    assert responder.reports == []
    source.settings = replace(SETTINGS, required_frames=2, window_size=3)
    await watcher.check(PRINTING)
    assert len(responder.reports) == 1


async def test_a_response_that_fails_does_not_stop_the_watcher_or_repeat_the_alert():
    watcher, _, responder = make_watcher([0.9, 0.9, 0.9])
    responder.failure = RuntimeError("push is down")
    for _ in range(3):
        status = await watcher.check(PRINTING)
    assert status.state == "alert"
    assert len(responder.reports) == 1


@pytest.mark.parametrize("state", [{}, {"state": None}])
async def test_a_printer_state_that_is_not_known_yet_is_idle(state: dict[str, Any]):
    watcher, _, _ = make_watcher([])
    assert (await watcher.check(state)).state == "idle"
