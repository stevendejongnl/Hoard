import asyncio
import sqlite3
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
    tag_id: str | None = None


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
    tag_id: str | None = None


@router.get("")
async def list_spools() -> list[dict[str, Any]]:
    return await cache.get_or_set("spools:list", db.list_spools, ttl=1800)


@router.get("/by-tag/{tag_id}")
async def find_spool_by_tag(tag_id: str) -> dict[str, Any]:
    spool = await db.find_spool_by_tag(tag_id)
    if not spool:
        raise HTTPException(404, "No spool has this tag")
    return spool


@router.post("", status_code=201)
async def create_spool(body: SpoolCreate) -> dict[str, Any]:
    try:
        result = await db.create_spool(body.model_dump())
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "Another spool already has this tag") from exc
    await cache.invalidate("spools:list")
    return result


@router.patch("/{spool_id}")
async def update_spool(spool_id: int, body: SpoolUpdate) -> dict[str, Any]:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(422, "No fields to update")
    if body.tag_id == "":
        data["tag_id"] = None
    try:
        result = await db.update_spool(spool_id, data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "Another spool already has this tag") from exc
    if not result:
        raise HTTPException(404, "Spool not found")
    if "cost_per_gram" in data:
        asyncio.create_task(_recalculate_spool_prints(spool_id))
    await cache.invalidate("spools:list")
    await cache.invalidate_prefix("history:")
    return result


@router.delete("/{spool_id}", status_code=204)
async def delete_spool(spool_id: int) -> None:
    ok = await db.delete_spool(spool_id)
    if not ok:
        raise HTTPException(409, "Spool has linked prints — unlink first")
    await cache.invalidate("spools:list")
    await cache.invalidate_prefix("history:")
