import asyncio
import json
import logging
from typing import Any

log = logging.getLogger(__name__)


class SSEHub:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue[str]] = []

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue()
        self._queues.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
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
    while True:
        try:
            watts = await ha.get_current_power()
            price = await ha.get_current_price()
            await hub.broadcast("power", {"watts": watts, "eur_per_kwh": price})
        except Exception as exc:
            log.warning("HA poll error: %s", exc)
        await asyncio.sleep(interval)


async def _poll_pi_stats(interval: int = 30) -> None:
    from app.moonraker import moonraker
    while True:
        try:
            data = await moonraker.get_proc_stats()
            cpu_temp = data.get("moonraker_stats", [{}])[-1].get("cpu_temp", 0)
            mem = data.get("system_memory", {})
            mem_total = mem.get("total", 1)
            mem_used = mem.get("used", 0)
            procs = data.get("moonraker_stats", [{}])
            cpu_load = procs[-1].get("cpu_usage", 0) if procs else 0
            disk = data.get("system_info", {}).get("disk_usage", {})
            disk_pct = disk.get("usage_percent", 0)
            uptime = data.get("system_uptime", 0)
            await hub.broadcast("pi_stats", {
                "cpu_temp": round(cpu_temp, 1),
                "cpu_load": round(cpu_load, 1),
                "memory_pct": round(mem_used / mem_total * 100, 1) if mem_total else 0,
                "disk_pct": round(disk_pct, 1),
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
