import math

from fastapi import APIRouter, HTTPException

from app import db, ha
from app.moonraker import moonraker

router = APIRouter(prefix="/api/predict", tags=["predict"])

_FALLBACK_WATTS = 105.0
# 1.75mm filament, PLA density 1.24 g/cm³: π × (0.875mm)² × 1.24 × 0.001
_MM_TO_GRAMS = math.pi * (0.875 ** 2) * 1.24 * 0.001


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


@router.get("")
async def predict(filename: str, spool_id: int | None = None, quantity: int = 1) -> dict:
    # Gcode metadata from Moonraker (slicer-provided)
    try:
        meta = await moonraker.get_file_metadata(filename)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker metadata error: {exc}") from exc

    filament_g = _filament_grams(meta)
    estimated_time_s = float(meta.get("estimated_time") or 0)
    layer_count = meta.get("layer_count")

    # Spool cost
    cost_per_gram = 0.0
    material = None
    if spool_id is not None:
        spools = await db.list_spools()
        spool = next((s for s in spools if s["id"] == spool_id), None)
        if spool:
            cost_per_gram = spool["cost_per_gram"]
            material = spool["material"]
    else:
        active = await db.get_active_spool()
        if active:
            cost_per_gram = active["cost_per_gram"]
            material = active["material"]
            spool_id = active["id"]

    # Energy: use recent 27h time-weighted avg
    avg_price = await ha.avg_price_hours(27)
    avg_watts = _FALLBACK_WATTS  # actual draw from HA smart plug history average

    # Try to get recent print avg watts for a better estimate
    try:
        from datetime import datetime, timedelta, timezone
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=27)
        recent_watts = await ha.avg_power_over(start, end)
        if recent_watts > 5:
            avg_watts = recent_watts
    except Exception:
        pass

    estimated_h = estimated_time_s / 3600
    cost_filament = round(filament_g * cost_per_gram * quantity, 4)
    energy_kwh = avg_watts * estimated_h * quantity / 1000
    cost_electricity = round(energy_kwh * avg_price, 4)
    cost_total = round(cost_filament + cost_electricity, 4)

    return {
        "filename": filename,
        "quantity": quantity,
        "spool_id": spool_id,
        "material": material,
        "filament_g": round(filament_g * quantity, 2),
        "estimated_time_s": estimated_time_s * quantity,
        "layer_count": layer_count,
        "avg_watts": round(avg_watts, 1),
        "avg_eur_per_kwh": round(avg_price, 4),
        "cost_filament": cost_filament,
        "cost_electricity": cost_electricity,
        "cost_total": cost_total,
    }
