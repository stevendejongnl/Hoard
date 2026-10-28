from fastapi import APIRouter, Depends, HTTPException, Query

from app.moonraker import moonraker

router = APIRouter(prefix="/api/temperatures", tags=["temperatures"])

DEFAULT_WINDOW_SECONDS = 600
DEFAULT_INTERVAL_SECONDS = 5


async def fetch_temperature_store() -> dict:
    return await moonraker.get("/server/temperature_store")


def read_temperature_store():
    """The function that fetches the store; tests replace it with a fake."""
    return fetch_temperature_store


def read_series(store: dict, heater: str, key: str) -> list[float]:
    return store.get(heater, {}).get(key, [])


def pick_value(series: list[float], age_seconds: int, fallback: float = 0.0) -> float:
    return series[len(series) - 1 - age_seconds] if age_seconds < len(series) else fallback


def list_ages(store: dict, window_seconds: int, interval_seconds: int) -> list[int]:
    sample_count = len(read_series(store, "extruder", "temperatures"))
    return [age for age in range(window_seconds, -1, -interval_seconds) if age < sample_count]


def create_sample(store: dict, age_seconds: int) -> dict:
    return {
        "age_seconds": age_seconds,
        "hotend_actual": pick_value(read_series(store, "extruder", "temperatures"), age_seconds),
        "hotend_target": pick_value(read_series(store, "extruder", "targets"), age_seconds),
        "bed_actual": pick_value(read_series(store, "heater_bed", "temperatures"), age_seconds),
        "bed_target": pick_value(read_series(store, "heater_bed", "targets"), age_seconds),
    }


@router.get("/history")
async def list_temperature_history(
    seconds: int = Query(DEFAULT_WINDOW_SECONDS, gt=0),
    interval: int = Query(DEFAULT_INTERVAL_SECONDS, gt=0),
    fetch_store=Depends(read_temperature_store),
) -> dict:
    try:
        store = await fetch_store()
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"samples": [create_sample(store, age) for age in list_ages(store, seconds, interval)]}
