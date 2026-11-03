"""Keeps the alerts of failed prints, each with the camera frame that raised it."""

import logging
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from app.spaghetti_watch import FailureReport

log = logging.getLogger(__name__)

KEPT_ALERTS = 500


def _describe(report: FailureReport) -> list[dict[str, Any]]:
    return [
        {"label": detection.label, "score": detection.score, "box": list(detection.box) if detection.box else None}
        for detection in report.detections
    ]


class DetectionAlertStore:
    def __init__(
        self,
        database: Any,
        frames_directory: Path,
        fetch_frame: Callable[[], Awaitable[bytes]],
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._database = database
        self._frames_directory = frames_directory
        self._fetch_frame = fetch_frame
        self._clock = clock

    def frame_path(self, alert_id: int) -> Path | None:
        path = self._frames_directory / f"{alert_id}.jpg"
        return path if path.exists() else None

    async def save(self, report: FailureReport) -> int:
        alert_id = await self._database.add_detection_alert(
            int(self._clock()), report.filename, report.score, _describe(report)
        )
        await self._keep_frame(alert_id)
        return alert_id

    async def _keep_frame(self, alert_id: int) -> None:
        try:
            frame = await self._fetch_frame()
            self._frames_directory.mkdir(parents=True, exist_ok=True)
            (self._frames_directory / f"{alert_id}.jpg").write_bytes(frame)
        except Exception as exc:
            log.warning("Could not keep the frame of alert %s: %s", alert_id, exc)
            return
        await self._database.mark_detection_alert_has_frame(alert_id)

    async def prune(self, keep: int = KEPT_ALERTS) -> None:
        for alert_id in await self._database.delete_detection_alerts_beyond(keep):
            (self._frames_directory / f"{alert_id}.jpg").unlink(missing_ok=True)
