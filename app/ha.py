import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import websockets

from app.config import settings
from app.influx import influx

log = logging.getLogger(__name__)

_POWER_SENSOR = "sensor.3d_printer_power"
_PRICE_SENSOR = "sensor.electricity_price_all_in"

# Energy entities in chronological order — the plug was renamed over time.
# We query all three and use whichever has data for the print's time window.
_ENERGY_STATS_IDS = [
    "sensor.3dprinter_consumption",  # Dec 2021 → Oct 2023
    "sensor.3d_printer_summation_delivered",  # Oct 2023 → Nov 2023 (bridge)
    "sensor.3d_printer_energy",  # Nov 2023 → present
]


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
    cap = window_end if window_end is not None else datetime.now(UTC)
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
    """Return average electricity price for a window.

    Priority: InfluxDB (full history) → HA history (recent 10 days) → 0.
    """
    influx_price = influx.query_avg_price_between(start, end)
    if influx_price and influx_price > 0.001:
        return influx_price

    states = await get_history(_PRICE_SENSOR, start, end)
    return time_weighted_avg(states, window_end=end)


async def avg_price_hours(hours: int = 27) -> float:
    """Recent N-hour time-weighted average electricity price."""
    end = datetime.now(UTC)
    start = end - timedelta(hours=hours)
    return await avg_price_over(start, end)


async def _ws_statistics_during_period(
    statistic_ids: list[str],
    start: datetime,
    end: datetime,
) -> dict[str, list[dict[str, Any]]]:
    """Query HA long-term statistics via WebSocket.

    The REST endpoint (/api/statistics_during_period) was removed in HA 2026.
    The WebSocket message type recorder/statistics_during_period is the only way.
    Points use millisecond epoch timestamps in 'start'/'end' fields.
    """
    ws_url = settings.ha_url.replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"
    req_start = (start - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    req_end = (end + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    try:
        async with websockets.connect(ws_url, ping_interval=None, open_timeout=10) as ws:
            msg = json.loads(await ws.recv())
            if msg.get("type") != "auth_required":
                return {}
            await ws.send(json.dumps({"type": "auth", "access_token": settings.ha_token}))
            msg = json.loads(await ws.recv())
            if msg.get("type") != "auth_ok":
                return {}
            await ws.send(
                json.dumps(
                    {
                        "id": 1,
                        "type": "recorder/statistics_during_period",
                        "start_time": req_start,
                        "end_time": req_end,
                        "statistic_ids": statistic_ids,
                        "period": "5minute",
                        "units": {"energy": "kWh"},
                    }
                )
            )
            msg = json.loads(await ws.recv())
            if not msg.get("success"):
                return {}
            result = msg.get("result", {})
            return result if isinstance(result, dict) else {}
    except Exception as exc:
        log.debug("HA WebSocket statistics failed: %s", exc)
        return {}


async def energy_used_kwh(start: datetime, end: datetime) -> float | None:
    """Get exact kWh used between start and end using HA long-term statistics.

    Queries all historical energy entities (plug was renamed over the years)
    via the WebSocket API — works for any print going back to Dec 2021.
    Returns None if no statistics cover the period.
    """
    start_ms = start.timestamp() * 1000
    end_ms = end.timestamp() * 1000

    all_stats = await _ws_statistics_during_period(_ENERGY_STATS_IDS, start, end)

    # Try each entity; use the first one that brackets the print window
    for entity_id in _ENERGY_STATS_IDS:
        points = all_stats.get(entity_id, [])
        if not isinstance(points, list) or not points:
            continue

        sum_before: float | None = None
        sum_at_end: float | None = None

        for pt in points:
            s = pt.get("sum")
            if s is None:
                continue
            pt_end_ms = pt.get("end", 0)
            if pt_end_ms <= start_ms:
                sum_before = s
            if pt_end_ms <= end_ms:
                sum_at_end = s

        if sum_before is not None and sum_at_end is not None:
            delta = sum_at_end - sum_before
            return max(0.0, round(delta, 4))

    return None
