from fastapi import APIRouter, HTTPException

from app.control_layout import DEVICES, ControlLayout
from app.routes.dependencies import Database

router = APIRouter(prefix="/api/control/layout", tags=["control"])


def require_known_device(device: str) -> str:
    if device not in DEVICES:
        raise HTTPException(404, "Device not found")
    return device


@router.get("/{device}")
async def get_layout(device: str, database: Database) -> dict | None:
    return await database.get_control_layout(require_known_device(device))


@router.put("/{device}")
async def save_layout(device: str, layout: ControlLayout, database: Database) -> dict:
    values = layout.model_dump()
    await database.save_control_layout(require_known_device(device), values)
    return values


@router.delete("/{device}")
async def reset_layout(device: str, database: Database) -> dict:
    await database.delete_control_layout(require_known_device(device))
    return {"ok": True}
