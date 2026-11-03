"""Watches the camera during a print and tells when the print looks failed."""

import logging
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.detection_settings import DetectionSettings
from app.detectors import Detection, Detector, DetectorUnavailableError, highest_score

log = logging.getLogger(__name__)

PRINTING_STATE = "printing"
PAUSED_STATE = "paused"


class FailureWindow:
    """The scores of the newest frames. One bad frame is noise; enough bad frames in a row of them is a failure."""

    def __init__(self, size: int, required: int, threshold: float) -> None:
        self._scores: deque[float] = deque(maxlen=size)
        self._required = required
        self._threshold = threshold

    def record(self, score: float) -> None:
        self._scores.append(score)

    def scores(self) -> list[float]:
        return list(self._scores)

    def clear(self) -> None:
        self._scores.clear()

    def is_failing(self) -> bool:
        failed_frames = [score for score in self._scores if score >= self._threshold]
        return len(failed_frames) >= self._required


@dataclass(frozen=True)
class WatchStatus:
    """What the watcher is doing: idle, off, watching, unavailable or alert, and the latest score."""

    state: str
    score: float | None = None


@dataclass(frozen=True)
class FailureReport:
    filename: str
    score: float
    detections: list[Detection]


class PrintWatcher:
    """Judges the camera image while a print runs and reports a failure once per print."""

    def __init__(
        self,
        detector: Detector,
        snapshot_url: str,
        load_settings: Callable[[], Awaitable[DetectionSettings]],
        respond: Callable[[FailureReport], Awaitable[None]],
    ) -> None:
        self._detector = detector
        self._snapshot_url = snapshot_url
        self._load_settings = load_settings
        self._respond = respond
        self._window: FailureWindow | None = None
        self._window_shape: tuple[int, int, float] | None = None
        self._alerted = False

    async def check(self, printer_state: dict) -> WatchStatus:
        state = printer_state.get("state")
        if state == PRINTING_STATE:
            return await self._watch(printer_state.get("filename") or "")
        if state != PAUSED_STATE:
            self._forget_print()
        return WatchStatus("alert" if self._alerted else "idle")

    def _forget_print(self) -> None:
        self._window = None
        self._window_shape = None
        self._alerted = False

    async def _watch(self, filename: str) -> WatchStatus:
        settings = await self._load_settings()
        if not settings.enabled:
            return WatchStatus("off")
        try:
            detections = await self._detector.detect(self._snapshot_url)
        except DetectorUnavailableError as exc:
            log.warning("Detector unavailable: %s", exc)
            return WatchStatus("unavailable")
        score = highest_score(detections)
        window = self._window_for(settings)
        window.record(score)
        if window.is_failing() and not self._alerted:
            self._alerted = True
            await self._report(FailureReport(filename, score, detections))
        return WatchStatus("alert" if self._alerted else "watching", score=score)

    def _window_for(self, settings: DetectionSettings) -> FailureWindow:
        shape = (settings.window_size, settings.required_frames, settings.threshold)
        if self._window is None or shape != self._window_shape:
            previous_scores = self._window.scores() if self._window else []
            self._window = FailureWindow(*shape)
            self._window_shape = shape
            for score in previous_scores:
                self._window.record(score)
        return self._window

    async def _report(self, report: FailureReport) -> None:
        try:
            await self._respond(report)
        except Exception as exc:
            log.warning("Could not respond to a failed print: %s", exc)
