"""Builds the print failure monitor from the settings of the app. Without a detector address there is none."""

import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx

from app.detection_alerts import DetectionAlertStore
from app.detection_backends import build_detector
from app.detection_monitor import DetectionMonitor
from app.detection_settings import DetectionSettings, build_detection_settings
from app.failure_response import FailureResponder
from app.spaghetti_watch import PrintWatcher

DETECTION_FRAMES_FOLDER = "detections"
PAUSE_PATH = "/printer/print/pause"
FRAME_TIMEOUT_SECONDS = 10.0


def _default_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=FRAME_TIMEOUT_SECONDS)


def build_detection_monitor(
    app_settings: Any,
    database: Any,
    event_hub: Any,
    notify: Callable[..., Awaitable[None]],
    moonraker_client: Any,
    read_printer_state: Callable[[], dict[str, Any]],
    http_client_factory: Callable[[], Any] = _default_http_client,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> DetectionMonitor | None:
    detector = build_detector(app_settings, http_client_factory)
    if detector is None:
        return None

    async def load_settings() -> DetectionSettings:
        return build_detection_settings(await database.get_detection_settings())

    async def fetch_frame() -> bytes:
        async with http_client_factory() as client:
            response = await client.get(app_settings.detector_snapshot_url)
            response.raise_for_status()
            return response.content

    async def pause_print() -> None:
        await moonraker_client.post(PAUSE_PATH)

    frames_directory = Path(app_settings.uploads_dir) / DETECTION_FRAMES_FOLDER
    alert_store = DetectionAlertStore(database, frames_directory, fetch_frame)
    responder = FailureResponder(alert_store, notify, pause_print, load_settings)
    watcher = PrintWatcher(detector, app_settings.detector_snapshot_url, load_settings, responder.respond)
    return DetectionMonitor(watcher, read_printer_state, load_settings, event_hub, sleep)
