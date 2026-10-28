import asyncio
import sqlite3
from collections.abc import Callable, Coroutine
from types import ModuleType
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.recorder import _recalculate_spool_prints
from app.routes.dependencies import Cache, Database

router = APIRouter(prefix="/api/spools", tags=["spools"])


def provide_spool_price_recalculator() -> Callable[[int], Coroutine[Any, Any, None]]:
    return _recalculate_spool_prints


SpoolPriceRecalculator = Annotated[
    Callable[[int], Coroutine[Any, Any, None]], Depends(provide_spool_price_recalculator)
]


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
async def list_spools(database: Database, cache: Cache) -> list[dict[str, Any]]:
    return await cache.get_or_set("spools:list", database.list_spools, ttl=1800)


@router.get("/by-tag/{tag_id}")
async def find_spool_by_tag(tag_id: str, database: Database) -> dict[str, Any]:
    spool = await database.find_spool_by_tag(tag_id)
    if not spool:
        raise HTTPException(404, "No spool has this tag")
    return spool


@router.post("", status_code=201)
async def create_spool(body: SpoolCreate, database: Database, cache: Cache) -> dict[str, Any]:
    try:
        result = await database.create_spool(body.model_dump())
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "Another spool already has this tag") from exc
    await cache.invalidate("spools:list")
    return result


def _collect_spool_changes(body: SpoolUpdate) -> dict[str, Any]:
    changes = {key: value for key, value in body.model_dump().items() if value is not None}
    if not changes:
        raise HTTPException(422, "No fields to update")
    if body.tag_id == "":
        changes["tag_id"] = None
    return changes


async def _store_spool_changes(database: ModuleType, spool_id: int, changes: dict[str, Any]) -> dict[str, Any]:
    try:
        result = await database.update_spool(spool_id, changes)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "Another spool already has this tag") from exc
    if not result:
        raise HTTPException(404, "Spool not found")
    return result


@router.patch("/{spool_id}")
async def update_spool(
    spool_id: int,
    body: SpoolUpdate,
    database: Database,
    cache: Cache,
    recalculate_prints: SpoolPriceRecalculator,
) -> dict[str, Any]:
    changes = _collect_spool_changes(body)
    result = await _store_spool_changes(database, spool_id, changes)
    if "cost_per_gram" in changes:
        asyncio.create_task(recalculate_prints(spool_id))
    await cache.invalidate("spools:list")
    await cache.invalidate_prefix("history:")
    return result


@router.delete("/{spool_id}", status_code=204)
async def delete_spool(spool_id: int, database: Database, cache: Cache) -> None:
    if not await database.delete_spool(spool_id):
        raise HTTPException(409, "Spool has linked prints — unlink first")
    await cache.invalidate("spools:list")
    await cache.invalidate_prefix("history:")
