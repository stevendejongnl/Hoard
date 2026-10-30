from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.routes.dependencies import Database, Moonraker
from app.system_faults import detect_faults
from app.system_readings import read_host
from app.system_snapshot import build_sections

router = APIRouter(prefix="/api/system", tags=["system"])


class HiddenRows(BaseModel):
    keys: list[str]


@router.get("")
async def get_system(moonraker: Moonraker, database: Database) -> dict[str, Any]:
    readings = await read_host(moonraker)
    return {
        "reachable": readings["reachable"],
        "sections": build_sections(readings),
        "active_faults": detect_faults(readings),
        "fault_history": await database.list_system_faults(),
        "hidden": await database.list_hidden_system_rows(),
    }


@router.put("/hidden")
async def set_hidden_rows(hidden_rows: HiddenRows, database: Database) -> dict[str, list[str]]:
    await database.set_hidden_system_rows(hidden_rows.keys)
    return {"hidden": await database.list_hidden_system_rows()}
