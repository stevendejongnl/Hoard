from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.auto_power_off import MAX_IDLE_MINUTES, InvalidAutoPowerOffSettingsError, build_auto_power_off_settings
from app.routes.dependencies import AutoPowerOffControl, Database

router = APIRouter(prefix="/api/control/auto-power-off", tags=["control"])


class SettingsChange(BaseModel):
    enabled: bool | None = None
    idle_minutes: int | None = None


class Postponement(BaseModel):
    minutes: int = Field(ge=1, le=MAX_IDLE_MINUTES)


async def _show(database: Database, auto_power_off: AutoPowerOffControl) -> dict[str, Any]:
    settings = build_auto_power_off_settings(await database.get_auto_power_off_settings())
    return {
        "enabled": settings.enabled,
        "idle_minutes": settings.idle_minutes,
        "off_at": auto_power_off.status().off_at,
    }


@router.get("")
async def get_auto_power_off(database: Database, auto_power_off: AutoPowerOffControl) -> dict[str, Any]:
    return await _show(database, auto_power_off)


@router.put("")
async def change_auto_power_off(
    change: SettingsChange, database: Database, auto_power_off: AutoPowerOffControl
) -> dict[str, Any]:
    changed = change.model_dump(exclude_none=True)
    try:
        build_auto_power_off_settings({**await database.get_auto_power_off_settings(), **changed})
    except InvalidAutoPowerOffSettingsError as exc:
        raise HTTPException(422, str(exc)) from exc
    await database.save_auto_power_off_settings(changed)
    return await _show(database, auto_power_off)


@router.post("/postpone")
async def postpone_auto_power_off(postponement: Postponement, auto_power_off: AutoPowerOffControl) -> dict[str, bool]:
    """Keeps the power on for this long, counted from now."""
    auto_power_off.postpone(postponement.minutes * 60)
    return {"ok": True}


@router.post("/cancel")
async def cancel_auto_power_off(auto_power_off: AutoPowerOffControl) -> dict[str, bool]:
    """Keeps the power on until the printer has been busy again."""
    auto_power_off.cancel()
    return {"ok": True}
