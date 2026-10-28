import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app import ha, push_client
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

    def last_value(self, event: str) -> dict[str, Any]:
        """The last data broadcast for an event, or an empty dictionary when there was none."""
        return self._cache.get(event, {})

    @property
    def client_count(self) -> int:
        return len(self._queues)


hub = SSEHub()


# ── Background tasks ──────────────────────────────────────────────────────────


async def _poll_printer_state(
    interval: int = 10,
    moonraker_client: Any = moonraker,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Poll Moonraker REST every 10s as a fallback so live status is always accurate.

    The WS subscription handles real-time diffs; this catches missed transitions
    (e.g. when subscription is set up while printer is already printing).
    """
    while True:
        await sleep(interval)
        try:
            result = await moonraker_client.get(
                "/printer/objects/query",
                print_stats="",
                display_status="",
                extruder="",
                heater_bed="",
            )
            status = result.get("status", {})
            if status:
                for handler in moonraker_client._handlers.get("notify_status_update", []):
                    await handler([status])
        except Exception:
            pass


def _handlers_for_status_update():
    return moonraker._handlers.get("notify_status_update", [])


async def _poll_ha(
    interval: int = 30,
    home_assistant: Any = ha,
    event_hub: Any = hub,
    read_switch_state: Callable[[], Awaitable[str]] = _get_switch_state,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    while True:
        try:
            watts = await home_assistant.get_current_power()
            price = await home_assistant.get_current_price()
            switch = await _switch_state_or_unknown(read_switch_state)
            await event_hub.broadcast("power", {"watts": watts, "eur_per_kwh": price, "switch": switch})
        except Exception as exc:
            log.warning("HA poll error: %s", exc)
        await sleep(interval)


async def _switch_state_or_unknown(read_switch_state: Callable[[], Awaitable[str]]) -> str:
    try:
        return await read_switch_state()
    except Exception:
        return "unknown"


async def _disk_usage_percent(moonraker_client: Any) -> float:
    try:
        directory = await moonraker_client.get("/server/files/directory?path=gcodes")
        usage = directory.get("disk_usage", {})
        total = usage.get("total", 0)
        if not total:
            return 0.0
        return round(usage.get("used", 0) / total * 100, 1)
    except Exception:
        return 0.0


def _pi_stats_payload(data: dict[str, Any], disk_percent: float) -> dict[str, Any]:
    memory = data.get("system_memory", {})
    memory_total = memory.get("total", 1)
    memory_used = memory.get("used", 0)
    cpu_usage = data.get("system_cpu_usage", {})
    cpu_load = cpu_usage.get("cpu", 0) if isinstance(cpu_usage, dict) else 0
    return {
        "cpu_temp": round(data.get("cpu_temp", 0), 1),
        "cpu_load": round(cpu_load, 1),
        "memory_pct": round(memory_used / memory_total * 100, 1) if memory_total else 0,
        "disk_pct": disk_percent,
        "uptime_s": int(data.get("system_uptime", 0)),
    }


async def _poll_pi_stats(
    interval: int = 30,
    moonraker_client: Any = moonraker,
    event_hub: Any = hub,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    while True:
        try:
            data = await moonraker_client.get_proc_stats()
            disk_percent = await _disk_usage_percent(moonraker_client)
            await event_hub.broadcast("pi_stats", _pi_stats_payload(data, disk_percent))
        except Exception as exc:
            log.warning("Pi stats poll error: %s", exc)
        await sleep(interval)


# ── Printer state from Moonraker status updates ───────────────────────────────

_ACTIVE_STATES = ("printing", "paused")
_ENDED_STATES = ("complete", "error", "cancelled")

_NOTIFICATIONS = {
    "complete": ("Print complete", "{filename} finished printing."),
    "error": ("Print failed", "{filename} hit an error."),
    "cancelled": ("Print cancelled", "{filename} was cancelled."),
}


def _printer_state_defaults(previous: dict[str, Any]) -> dict[str, Any]:
    return {
        "state": previous.get("state", "standby"),
        "filename": previous.get("filename", ""),
        "progress": previous.get("progress", 0),
        "layer": previous.get("layer"),
        "layer_total": previous.get("layer_total"),
        "time_remaining": previous.get("time_remaining", 0),
        "filament_used": previous.get("filament_used", 0),
        "speed": previous.get("speed", 0),
        "z_position": previous.get("z_position", 0),
    }


def _apply_print_stats(updated: dict[str, Any], print_stats: dict[str, Any]) -> None:
    for source, target in (
        ("state", "state"),
        ("filename", "filename"),
        ("print_duration", "time_remaining"),
        ("filament_used", "filament_used"),
    ):
        if source in print_stats:
            updated[target] = print_stats[source]
    info = print_stats.get("info") or {}
    if info.get("current_layer") is not None:
        updated["layer"] = info["current_layer"]
    if info.get("total_layer") is not None:
        updated["layer_total"] = info["total_layer"]


def _apply_display_status(updated: dict[str, Any], display_status: dict[str, Any]) -> None:
    if "progress" in display_status:
        updated["progress"] = round(display_status["progress"] * 100, 1)


def _apply_motion_report(updated: dict[str, Any], motion_report: dict[str, Any]) -> None:
    if "live_velocity" in motion_report:
        updated["speed"] = round(motion_report["live_velocity"], 1)
    position = motion_report.get("live_position")
    if position and len(position) >= 3:
        updated["z_position"] = round(position[2], 3)


def _merge_printer_state(previous: dict[str, Any], status: dict[str, Any]) -> dict[str, Any]:
    updated = _printer_state_defaults(previous)
    if status.get("print_stats"):
        _apply_print_stats(updated, status["print_stats"])
    if status.get("display_status"):
        _apply_display_status(updated, status["display_status"])
    if status.get("motion_report"):
        _apply_motion_report(updated, status["motion_report"])
    return updated


def _has_printer_fields(status: dict[str, Any]) -> bool:
    return bool(status.get("print_stats") or status.get("display_status") or status.get("motion_report"))


def _is_standby_during_print(previous_state: Any, new_state: Any) -> bool:
    """Klipper briefly reports standby during a firmware_restart before it restores the active print."""
    return new_state == "standby" and previous_state in _ACTIVE_STATES


def _is_print_ended(previous_state: Any, new_state: Any) -> bool:
    return new_state in _ENDED_STATES and previous_state in _ACTIVE_STATES and new_state != previous_state


class PrinterStateTracker:
    """Turns Moonraker status updates into printer state and temperature events on the hub."""

    def __init__(
        self,
        event_hub: Any = hub,
        notifier: Any = push_client,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        start_task: Callable[[Any], Any] = asyncio.create_task,
        standby_delay_seconds: float = 8,
    ) -> None:
        self._hub = event_hub
        self._notifier = notifier
        self._sleep = sleep
        self._start_task = start_task
        self._standby_delay_seconds = standby_delay_seconds
        self._standby_task: Any = None

    async def handle_status_update(self, params: list[Any]) -> None:
        if not params:
            return
        status = params[0] if isinstance(params[0], dict) else {}

        if _has_printer_fields(status):
            previous = self._hub.last_value("printer_state")
            updated = _merge_printer_state(previous, status)
            if _is_standby_during_print(previous.get("state"), updated["state"]):
                self._delay_standby(updated)
                return
            await self._publish_printer_state(previous.get("state"), updated)

        await self._publish_temperatures(status)

    def _delay_standby(self, payload: dict[str, Any]) -> None:
        """Hold standby back, so the frontend does not flash "Printer idle" during a normal klippy reconnect."""
        self._cancel_delayed_standby()
        self._standby_task = self._start_task(self._broadcast_after_delay(payload))

    async def _broadcast_after_delay(self, payload: dict[str, Any]) -> None:
        await self._sleep(self._standby_delay_seconds)
        await self._hub.broadcast("printer_state", payload)

    def _cancel_delayed_standby(self) -> None:
        if self._standby_task:
            self._standby_task.cancel()

    async def _publish_printer_state(self, previous_state: Any, updated: dict[str, Any]) -> None:
        self._cancel_delayed_standby()
        self._standby_task = None
        if _is_print_ended(previous_state, updated["state"]):
            self._start_task(self._notify_print_ended(updated))
        await self._hub.broadcast("printer_state", updated)

    async def _notify_print_ended(self, updated: dict[str, Any]) -> None:
        title, body_template = _NOTIFICATIONS[updated["state"]]
        body = body_template.format(filename=updated.get("filename") or "Print")
        await self._notifier.notify(title, body, "/")

    async def _publish_temperatures(self, status: dict[str, Any]) -> None:
        extruder = status.get("extruder", {})
        bed = status.get("heater_bed", {})
        if not (extruder or bed):
            return
        previous = self._hub.last_value("temps")
        await self._hub.broadcast(
            "temps",
            {
                "hotend_actual": round(extruder.get("temperature", previous.get("hotend_actual", 0)), 1),
                "hotend_target": round(extruder.get("target", previous.get("hotend_target", 0)), 1),
                "bed_actual": round(bed.get("temperature", previous.get("bed_actual", 0)), 1),
                "bed_target": round(bed.get("target", previous.get("bed_target", 0)), 1),
            },
        )


printer_state_tracker = PrinterStateTracker()


async def _handle_status_update(params: list[Any]) -> None:
    await printer_state_tracker.handle_status_update(params)


async def _handle_klippy_ready(params: list[Any]) -> None:
    """Klipper reconnected — re-seed state immediately."""
    asyncio.create_task(moonraker._seed_initial_state())


def register_ws_handlers() -> None:
    moonraker.on("notify_status_update", _handle_status_update)
    moonraker.on("notify_klippy_ready", _handle_klippy_ready)
