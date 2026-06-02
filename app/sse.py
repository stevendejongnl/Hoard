import asyncio
import json
import logging
from typing import Any

log = logging.getLogger(__name__)


class SSEHub:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue[str]] = []
        self._cache: dict[str, dict[str, Any]] = {}  # last known value per event type

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue()
        self._queues.append(q)
        # replay cached values immediately so new clients don't wait up to 30s
        for event, data in self._cache.items():
            q.put_nowait(f"event: {event}\ndata: {json.dumps(data)}\n\n")
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        self._cache[event] = data
        if not self._queues:
            return
        msg = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        for q in list(self._queues):
            await q.put(msg)

    @property
    def client_count(self) -> int:
        return len(self._queues)


hub = SSEHub()


# ── Background tasks ──────────────────────────────────────────────────────────

async def _poll_ha(interval: int = 30) -> None:
    from app import ha
    from app.routes.control import _get_switch_state
    while True:
        try:
            watts = await ha.get_current_power()
            price = await ha.get_current_price()
            try:
                switch = await _get_switch_state()
            except Exception:
                switch = "unknown"
            await hub.broadcast("power", {"watts": watts, "eur_per_kwh": price, "switch": switch})
        except Exception as exc:
            log.warning("HA poll error: %s", exc)
        await asyncio.sleep(interval)


async def _poll_pi_stats(interval: int = 30) -> None:
    from app.moonraker import moonraker
    while True:
        try:
            data = await moonraker.get_proc_stats()
            cpu_temp = data.get("cpu_temp", 0)
            mem = data.get("system_memory", {})
            mem_total = mem.get("total", 1)
            mem_used = mem.get("used", 0)
            cpu_usage = data.get("system_cpu_usage", {})
            cpu_load = cpu_usage.get("cpu", 0) if isinstance(cpu_usage, dict) else 0
            uptime = data.get("system_uptime", 0)
            await hub.broadcast("pi_stats", {
                "cpu_temp": round(cpu_temp, 1),
                "cpu_load": round(cpu_load, 1),
                "memory_pct": round(mem_used / mem_total * 100, 1) if mem_total else 0,
                "disk_pct": 0,
                "uptime_s": int(uptime),
            })
        except Exception as exc:
            log.warning("Pi stats poll error: %s", exc)
        await asyncio.sleep(interval)


async def _handle_status_update(params: list[Any]) -> None:
    if not params:
        return
    status = params[0] if isinstance(params[0], dict) else {}

    ps = status.get("print_stats", {})
    if ps:
        await hub.broadcast("printer_state", {
            "state": ps.get("state", "standby"),
            "filename": ps.get("filename", ""),
            "progress": round(ps.get("progress", 0) * 100, 1),
            "layer": ps.get("info", {}).get("current_layer"),
            "layer_total": ps.get("info", {}).get("total_layer"),
            "time_remaining": ps.get("print_duration", 0),
        })

    extruder = status.get("extruder", {})
    bed = status.get("heater_bed", {})
    if extruder or bed:
        await hub.broadcast("temps", {
            "hotend_actual": round(extruder.get("temperature", 0), 1),
            "hotend_target": round(extruder.get("target", 0), 1),
            "bed_actual": round(bed.get("temperature", 0), 1),
            "bed_target": round(bed.get("target", 0), 1),
        })


def register_ws_handlers() -> None:
    from app.moonraker import moonraker
    moonraker.on("notify_status_update", _handle_status_update)
