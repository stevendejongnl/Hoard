import math
from datetime import UTC, datetime, timedelta
from types import ModuleType
from typing import Any

from fastapi import APIRouter, HTTPException

from app.db import Database as SqliteDatabase
from app.moonraker import MoonrakerClient
from app.routes.dependencies import Database, HomeAssistant, Moonraker

router = APIRouter(prefix="/api/predict", tags=["predict"])

_FALLBACK_WATTS = 105.0
# 1.75mm filament, PLA density 1.24 g/cm³: π × (0.875mm)² × 1.24 × 0.001
_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001


def _filament_grams(meta: dict) -> float:
    """Extract filament weight in grams from Moonraker metadata.

    PrusaSlicer/Bambu embed filament_weight_total (g).
    Cura embeds filament_total (mm) — convert with 1.75mm PLA density.
    """
    if meta.get("filament_weight_total"):
        return float(meta["filament_weight_total"])
    if meta.get("filament_total"):
        return float(meta["filament_total"]) * _MM_TO_GRAMS
    return 0.0


async def _read_metadata(moonraker: MoonrakerClient, filename: str) -> dict:
    try:
        return await moonraker.get_file_metadata(filename)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker metadata error: {exc}") from exc


async def _pick_spool(database: SqliteDatabase, spool_id: int | None) -> dict[str, Any] | None:
    """The spool asked for, else the active one."""
    if spool_id is None:
        return await database.get_active_spool()
    return next((spool for spool in await database.list_spools() if spool["id"] == spool_id), None)


async def _estimate_average_watts(home_assistant: ModuleType) -> float:
    """The recent 27h time-weighted average of the power sensor, the default when there is none."""
    try:
        end = datetime.now(UTC)
        recent_watts = await home_assistant.avg_power_over(end - timedelta(hours=27), end)
    except Exception:
        return _FALLBACK_WATTS
    return recent_watts if recent_watts > 5 else _FALLBACK_WATTS


@router.get("")
async def predict(
    filename: str,
    moonraker: Moonraker,
    database: Database,
    home_assistant: HomeAssistant,
    spool_id: int | None = None,
    quantity: int = 1,
) -> dict:
    meta = await _read_metadata(moonraker, filename)
    filament_g = _filament_grams(meta)
    estimated_time_s = float(meta.get("estimated_time") or 0)

    spool = await _pick_spool(database, spool_id)
    cost_per_gram = spool["cost_per_gram"] if spool else 0.0
    material = spool["material"] if spool else None
    if spool_id is None and spool:
        spool_id = spool["id"]

    avg_price = await home_assistant.avg_price_hours(27)
    avg_watts = await _estimate_average_watts(home_assistant)

    cost_filament = round(filament_g * cost_per_gram * quantity, 4)
    energy_kwh = avg_watts * (estimated_time_s / 3600) * quantity / 1000
    cost_electricity = round(energy_kwh * avg_price, 4)

    return {
        "filename": filename,
        "quantity": quantity,
        "spool_id": spool_id,
        "material": material,
        "filament_g": round(filament_g * quantity, 2),
        "estimated_time_s": estimated_time_s * quantity,
        "layer_count": meta.get("layer_count"),
        "avg_watts": round(avg_watts, 1),
        "avg_eur_per_kwh": round(avg_price, 4),
        "cost_filament": cost_filament,
        "cost_electricity": cost_electricity,
        "cost_total": round(cost_filament + cost_electricity, 4),
    }
