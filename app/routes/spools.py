import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import cache, db
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
    return await cache.get_or_set("spools:list", db.list_spools, ttl=1800)


@router.post("", status_code=201)
async def create_spool(body: SpoolCreate) -> dict[str, Any]:
    result = await db.create_spool(body.model_dump())
    await cache.invalidate("spools:list")
    return result


@router.patch("/{spool_id}")
async def update_spool(spool_id: int, body: SpoolUpdate) -> dict[str, Any]:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await db.update_spool(spool_id, data)
    if not result:
        raise HTTPException(404, "Spool not found")
    if "cost_per_gram" in data:
        asyncio.create_task(_recalculate_spool_prints(spool_id))
    if data:
        await cache.invalidate("spools:list")
        asyncio.create_task(cache.invalidate_prefix("history:"))
    return result


@router.delete("/{spool_id}", status_code=204)
async def delete_spool(spool_id: int) -> None:
    ok = await db.delete_spool(spool_id)
    if not ok:
        raise HTTPException(409, "Spool has linked prints — unlink first")
    await cache.invalidate("spools:list")
    asyncio.create_task(cache.invalidate_prefix("history:"))
