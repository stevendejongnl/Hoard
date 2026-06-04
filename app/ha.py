from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings

_POWER_SENSOR = "sensor.3d_printer_power"
_PRICE_SENSOR = "sensor.electricity_price_all_in"


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.ha_token}"}


async def get_state(entity_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{settings.ha_url}/api/states/{entity_id}",
            headers=_headers(),
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


async def get_current_power() -> float:
    try:
        data = await get_state(_POWER_SENSOR)
        return float(data["state"])
    except Exception:
        return 0.0


async def get_current_price() -> float:
    try:
        data = await get_state(_PRICE_SENSOR)
        return float(data["state"])
    except Exception:
        return 0.0


async def get_history(entity_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    params = {
        "filter_entity_id": entity_id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "minimal_response": "true",
        "no_attributes": "true",
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{settings.ha_url}/api/history/period/{start.isoformat()}",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        return data[0] if data else []


def time_weighted_avg(states: list[dict[str, Any]]) -> float:
    """Compute time-weighted average of numeric HA state history entries."""
    if not states:
        return 0.0
    total_weight = 0.0
    weighted_sum = 0.0
    for i, entry in enumerate(states):
        try:
            val = float(entry["state"])
        except (ValueError, KeyError):
            continue
        t_start = datetime.fromisoformat(entry["last_changed"].replace("Z", "+00:00"))
        if i + 1 < len(states):
            t_end = datetime.fromisoformat(states[i + 1]["last_changed"].replace("Z", "+00:00"))
        else:
            t_end = datetime.now(timezone.utc)
        duration = (t_end - t_start).total_seconds()
        if duration > 0:
            weighted_sum += val * duration
            total_weight += duration
    return weighted_sum / total_weight if total_weight > 0 else 0.0


async def avg_power_over(start: datetime, end: datetime) -> float:
    states = await get_history(_POWER_SENSOR, start, end)
    return time_weighted_avg(states)


async def avg_price_over(start: datetime, end: datetime) -> float:
    states = await get_history(_PRICE_SENSOR, start, end)
    return time_weighted_avg(states)


async def avg_price_hours(hours: int = 27) -> float:
    """Recent N-hour time-weighted average electricity price."""
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    return await avg_price_over(start, end)
