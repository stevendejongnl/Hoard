import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.recorder import _recalculate_spool_prints

router = APIRouter(prefix="/api/spools", tags=["spools"])


class SpoolCreate(BaseModel):
    brand: str
    material: str
    color: str
    color_hex: str | None = None
    cost_per_gram: float
    initial_weight_g: float
    current_weight_g: float
    notes: str | None = None
    active: bool = False


class SpoolUpdate(BaseModel):
    brand: str | None = None
    material: str | None = None
    color: str | None = None
    color_hex: str | None = None
    cost_per_gram: float | None = None
    initial_weight_g: float | None = None
    current_weight_g: float | None = None
    notes: str | None = None
    active: bool | None = None


@router.get("")
async def list_spools() -> list[dict[str, Any]]:
    return await db.list_spools()


@router.post("", status_code=201)
async def create_spool(body: SpoolCreate) -> dict[str, Any]:
    return await db.create_spool(body.model_dump())


@router.patch("/{spool_id}")
async def update_spool(spool_id: int, body: SpoolUpdate) -> dict[str, Any]:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await db.update_spool(spool_id, data)
    if not result:
        raise HTTPException(404, "Spool not found")
    # If cost changed, recalculate filament costs for all prints using this spool
    if "cost_per_gram" in data:
        asyncio.create_task(_recalculate_spool_prints(spool_id))
    return result


@router.delete("/{spool_id}", status_code=204)
async def delete_spool(spool_id: int) -> None:
    ok = await db.delete_spool(spool_id)
    if not ok:
        raise HTTPException(409, "Spool has linked prints — unlink first")
