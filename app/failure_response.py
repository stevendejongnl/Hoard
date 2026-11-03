"""What Hoard does when a print looks failed: keep the evidence, tell the owner, and pause when asked."""

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.detection_settings import DetectionSettings
from app.spaghetti_watch import FailureReport

log = logging.getLogger(__name__)

DETECTIONS_PAGE = "/detections"


class FailureResponder:
    def __init__(
        self,
        alert_store: Any,
        notify: Callable[..., Awaitable[None]],
        pause_print: Callable[[], Awaitable[None]],
        load_settings: Callable[[], Awaitable[DetectionSettings]],
    ) -> None:
        self._alert_store = alert_store
        self._notify = notify
        self._pause_print = pause_print
        self._load_settings = load_settings

    async def respond(self, report: FailureReport) -> None:
        """Each step stands alone: a failing push must not stop the pause."""
        await self._save(report)
        outcome = await self._pause_if_asked()
        await self._tell_owner(report, outcome)

    async def _save(self, report: FailureReport) -> None:
        try:
            await self._alert_store.save(report)
        except Exception as exc:
            log.warning("Could not save the failure alert: %s", exc)

    async def _pause_if_asked(self) -> str:
        if (await self._load_settings()).action != "pause":
            return ""
        try:
            await self._pause_print()
        except Exception as exc:
            log.warning("Could not pause the failed print: %s", exc)
            return "The print could not be paused."
        return "The print is paused."

    async def _tell_owner(self, report: FailureReport, outcome: str) -> None:
        body = f"{report.filename} looks failed ({round(report.score * 100)}% sure). {outcome}".strip()
        try:
            await self._notify("Print looks failed", body, DETECTIONS_PAGE)
        except Exception as exc:
            log.warning("Could not notify about the failed print: %s", exc)
