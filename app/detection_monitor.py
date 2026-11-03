"""Runs the print watcher all the time, announces what it sees, and counts a failed print as a fault."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.detection_settings import DetectionSettings
from app.spaghetti_watch import PrintWatcher, WatchStatus

log = logging.getLogger(__name__)

Fault = dict[str, Any]
FALLBACK_INTERVAL_SECONDS = 10


class DetectionMonitor:
    def __init__(
        self,
        watcher: PrintWatcher,
        read_printer_state: Callable[[], dict[str, Any]],
        load_settings: Callable[[], Awaitable[DetectionSettings]],
        event_hub: Any,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._watcher = watcher
        self._read_printer_state = read_printer_state
        self._load_settings = load_settings
        self._event_hub = event_hub
        self._sleep = sleep
        self._status = WatchStatus("idle")

    async def run(self) -> None:
        while True:
            interval = await self._round()
            await self._sleep(interval)

    async def _round(self) -> float:
        try:
            self._status = await self._watcher.check(self._read_printer_state())
            await self._event_hub.broadcast("detection", {"state": self._status.state, "score": self._status.score})
            return (await self._load_settings()).interval_seconds
        except Exception as exc:
            log.warning("Print failure watch error: %s", exc)
            return FALLBACK_INTERVAL_SECONDS

    def faults(self) -> list[Fault]:
        if self._status.state != "alert":
            return []
        score = round((self._status.score or 0) * 100)
        return [
            {
                "key": "detection.failure",
                "severity": "error",
                "source": "Detection",
                "title": "Print looks failed",
                "detail": f"The camera shows a failed print ({score}% sure)",
            }
        ]
