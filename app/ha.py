from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings

_POWER_SENSOR = "sensor.3d_printer_power"
_PRICE_SENSOR = "sensor.electricity_price_all_in"
_ENERGY_SENSOR = "sensor.3d_printer_energy"


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


def time_weighted_avg(states: list[dict[str, Any]], window_end: datetime | None = None) -> float:
    """Compute time-weighted average of numeric HA state history entries.

    window_end caps the last entry so it doesn't extend to datetime.now() for historical windows.
    """
    if not states:
        return 0.0
    cap = window_end if window_end is not None else datetime.now(timezone.utc)
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
            t_end = cap
        duration = (t_end - t_start).total_seconds()
        if duration > 0:
            weighted_sum += val * duration
            total_weight += duration
    return weighted_sum / total_weight if total_weight > 0 else 0.0


async def avg_power_over(start: datetime, end: datetime) -> float:
    states = await get_history(_POWER_SENSOR, start, end)
    return time_weighted_avg(states, window_end=end)


async def avg_price_over(start: datetime, end: datetime) -> float:
    states = await get_history(_PRICE_SENSOR, start, end)
    return time_weighted_avg(states, window_end=end)


async def avg_price_hours(hours: int = 27) -> float:
    """Recent N-hour time-weighted average electricity price."""
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    return await avg_price_over(start, end)


async def energy_used_kwh(start: datetime, end: datetime) -> float | None:
    """Get exact kWh used between start and end using HA long-term statistics.

    Uses the cumulative energy sensor (kWh meter) which HA stores in its statistics
    database indefinitely — works for any historical print, not just the last 10 days.
    Returns None if statistics are unavailable for the period.
    """
    from datetime import timedelta
    # Widen the window slightly so we always capture a data point just before start
    req_start = (start - timedelta(hours=1)).isoformat()
    req_end = (end + timedelta(minutes=10)).isoformat()
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{settings.ha_url}/api/statistics_during_period",
                headers=_headers(),
                json={
                    "start_time": req_start,
                    "end_time": req_end,
                    "statistic_ids": [_ENERGY_SENSOR],
                    "period": "5minute",
                    "units": {"energy": "kWh"},
                },
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
        except Exception:
            return None

    stats = data.get(_ENERGY_SENSOR, [])
    if not stats:
        return None

    # Find the cumulative sum (kWh meter reading) just before print start and at print end
    sum_before_start: float | None = None
    sum_at_end: float | None = None

    for stat in stats:
        s = stat.get("sum")
        if s is None:
            continue
        try:
            stat_end_dt = datetime.fromisoformat(stat["end"].replace("Z", "+00:00"))
        except Exception:
            continue
        if stat_end_dt <= start:
            sum_before_start = s
        if stat_end_dt <= end:
            sum_at_end = s

    if sum_at_end is None or sum_before_start is None:
        return None

    delta = sum_at_end - sum_before_start
    return max(0.0, round(delta, 4))
