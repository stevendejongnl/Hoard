from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.detection_backends import is_detection_configured, sends_frames_away
from app.detection_settings import InvalidDetectionSettingsError, build_detection_settings
from app.routes.dependencies import Database
from app.server_sent_events import SSEHub, hub
from app.threshold_tuning import suggest_threshold

router = APIRouter(prefix="/api/detection", tags=["detection"])


def provide_event_hub() -> SSEHub:
    return hub


EventHub = Annotated[SSEHub, Depends(provide_event_hub)]


class SettingsChange(BaseModel):
    enabled: bool | None = None
    threshold: float | None = None
    interval_seconds: int | None = None
    window_size: int | None = None
    required_frames: int | None = None
    action: str | None = None


class VerdictChange(BaseModel):
    ids: list[int] = Field(min_length=1)
    verdict: Literal["real", "false_alarm"] | None


def frames_directory() -> Path:
    return Path(settings.uploads_dir) / "detections"


async def _read_settings(database: Database) -> dict[str, Any]:
    return build_detection_settings(await database.get_detection_settings()).__dict__


def _show_alert(alert: dict[str, Any]) -> dict[str, Any]:
    frame_url = f"/api/detection/alerts/{alert['id']}/frame" if alert["has_frame"] else None
    return {**alert, "frame_url": frame_url}


@router.get("")
async def get_detection(database: Database, event_hub: EventHub) -> dict[str, Any]:
    configured = is_detection_configured(settings)
    announced = event_hub.last_value("detection")
    current = await _read_settings(database)
    suggestion = suggest_threshold(await database.list_detection_alerts(limit=500), current["threshold"])
    return {
        "configured": configured,
        "frames_leave_network": sends_frames_away(settings),
        "state": announced.get("state", "idle") if configured else "off",
        "score": announced.get("score") if configured else None,
        "settings": current,
        "suggestion": suggestion.__dict__ if suggestion else None,
    }


@router.get("/settings")
async def get_settings(database: Database) -> dict[str, Any]:
    return await _read_settings(database)


@router.put("/settings")
async def change_settings(change: SettingsChange, database: Database) -> dict[str, Any]:
    stored = await database.get_detection_settings()
    changed = change.model_dump(exclude_none=True)
    try:
        build_detection_settings({**stored, **changed})
    except InvalidDetectionSettingsError as exc:
        raise HTTPException(422, str(exc)) from exc
    await database.save_detection_settings(changed)
    return await _read_settings(database)


@router.get("/alerts")
async def list_alerts(
    database: Database, verdict: Literal["real", "false_alarm", "unlabelled"] | None = None
) -> list[dict[str, Any]]:
    return [_show_alert(alert) for alert in await database.list_detection_alerts(verdict=verdict)]


@router.post("/alerts/verdicts")
async def set_verdicts(change: VerdictChange, database: Database) -> dict[str, bool]:
    await database.set_detection_verdicts(change.ids, change.verdict)
    return {"ok": True}


@router.get("/alerts/{alert_id}/frame")
async def get_frame(alert_id: int) -> FileResponse:
    path = frames_directory() / f"{alert_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "No frame was kept for this alert")
    return FileResponse(path, media_type="image/jpeg")
