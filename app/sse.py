import asyncio
import json
import logging
from typing import Any

from app import ha
from app.moonraker import moonraker
from app.routes.control import _get_switch_state

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

            disk_pct = 0.0
            try:
                dir_data = await moonraker.get("/server/files/directory?path=gcodes")
                du = dir_data.get("disk_usage", {})
                disk_total = du.get("total", 0)
                disk_used = du.get("used", 0)
                if disk_total:
                    disk_pct = round(disk_used / disk_total * 100, 1)
            except Exception:
                pass

            await hub.broadcast("pi_stats", {
                "cpu_temp": round(cpu_temp, 1),
                "cpu_load": round(cpu_load, 1),
                "memory_pct": round(mem_used / mem_total * 100, 1) if mem_total else 0,
                "disk_pct": disk_pct,
                "uptime_s": int(uptime),
            })
        except Exception as exc:
            log.warning("Pi stats poll error: %s", exc)
        await asyncio.sleep(interval)


_standby_task: asyncio.Task[None] | None = None


async def _handle_status_update(params: list[Any]) -> None:
    global _standby_task
    if not params:
        return
    status = params[0] if isinstance(params[0], dict) else {}

    ps = status.get("print_stats", {})
    ds = status.get("display_status", {})
    mr = status.get("motion_report", {})

    if ps or ds or mr:
        prev = hub._cache.get("printer_state", {})
        updated: dict[str, Any] = {
            "state": prev.get("state", "standby"),
            "filename": prev.get("filename", ""),
            "progress": prev.get("progress", 0),
            "layer": prev.get("layer"),
            "layer_total": prev.get("layer_total"),
            "time_remaining": prev.get("time_remaining", 0),
            "filament_used": prev.get("filament_used", 0),
            "speed": prev.get("speed", 0),
            "z_position": prev.get("z_position", 0),
        }
        if ps:
            if "state" in ps:
                updated["state"] = ps["state"]
            if "filename" in ps:
                updated["filename"] = ps["filename"]
            if "print_duration" in ps:
                updated["time_remaining"] = ps["print_duration"]
            if "filament_used" in ps:
                updated["filament_used"] = ps["filament_used"]
            info = ps.get("info") or {}
            cl = info.get("current_layer")
            tl = info.get("total_layer")
            if cl is not None:
                updated["layer"] = cl
            if tl is not None:
                updated["layer_total"] = tl
        if ds:
            if "progress" in ds:
                updated["progress"] = round(ds["progress"] * 100, 1)
        if mr:
            if "live_velocity" in mr:
                updated["speed"] = round(mr["live_velocity"], 1)
            pos = mr.get("live_position")
            if pos and len(pos) >= 3:
                updated["z_position"] = round(pos[2], 3)

        new_state = updated.get("state")
        prev_state = prev.get("state")

        # Klipper briefly reports "standby" during firmware_restart before restoring
        # the active print. Delay broadcasting standby for 8s so the frontend doesn't
        # flash "Printer idle" during normal firmware-restart / klippy-reconnect cycles.
        if new_state == "standby" and prev_state in ("printing", "paused"):
            if _standby_task:
                _standby_task.cancel()

            async def _delayed_standby(payload: dict[str, Any]) -> None:
                await asyncio.sleep(8)
                await hub.broadcast("printer_state", payload)

            _standby_task = asyncio.create_task(_delayed_standby(updated))
            return

        if _standby_task:
            _standby_task.cancel()
            _standby_task = None

        await hub.broadcast("printer_state", updated)

    extruder = status.get("extruder", {})
    bed = status.get("heater_bed", {})
    if extruder or bed:
        prev = hub._cache.get("temps", {})
        await hub.broadcast("temps", {
            "hotend_actual": round(extruder.get("temperature", prev.get("hotend_actual", 0)), 1),
            "hotend_target": round(extruder.get("target", prev.get("hotend_target", 0)), 1),
            "bed_actual": round(bed.get("temperature", prev.get("bed_actual", 0)), 1),
            "bed_target": round(bed.get("target", prev.get("bed_target", 0)), 1),
        })


async def _handle_klippy_ready(params: list[Any]) -> None:
    """Klipper reconnected — re-seed state immediately."""
    asyncio.create_task(moonraker._seed_initial_state())


def register_ws_handlers() -> None:
    moonraker.on("notify_status_update", _handle_status_update)
    moonraker.on("notify_klippy_ready", _handle_klippy_ready)
