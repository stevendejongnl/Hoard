"""Finds what is wrong in what the printer's host reports, and keeps a history of it."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.db import default_database
from app.moonraker import moonraker
from app.server_sent_events import hub
from app.system_readings import read_host

log = logging.getLogger(__name__)

Fault = dict[str, Any]

# throttled_state flag -> (key, severity, title)
THROTTLE_FAULTS = {
    "Under-Voltage Detected": ("under_voltage", "error", "Under-voltage"),
    "Frequency Capped": ("frequency_capped", "error", "CPU frequency capped"),
    "Currently Throttled": ("throttled", "error", "CPU throttled"),
    "Temperature Limit Active": ("temperature_limit", "error", "CPU temperature limit"),
    "Previously Under-Volted": ("previously_under_volted", "warning", "Under-voltage since boot"),
    "Previously Frequency Capped": ("previously_frequency_capped", "warning", "CPU frequency capped since boot"),
    "Previously Throttled": ("previously_throttled", "warning", "CPU throttled since boot"),
    "Previously Temperature Limited": ("previously_temperature_limited", "warning", "CPU temperature limit since boot"),
}
# drv_status flag of a Trinamic driver -> (severity, title); its other fields are ordinary readings
DRIVER_FAULTS = {
    "ot": ("error", "over temperature"),
    "otpw": ("warning", "over temperature warning"),
    "s2ga": ("error", "short to ground on coil A"),
    "s2gb": ("error", "short to ground on coil B"),
    "s2vsa": ("error", "short to supply on coil A"),
    "s2vsb": ("error", "short to supply on coil B"),
    "ola": ("warning", "open load on coil A"),
    "olb": ("warning", "open load on coil B"),
    "uv_cp": ("error", "charge pump under-voltage"),
    "drv_err": ("error", "driver error"),
}
KLIPPER_FAULT_STATES = ("error", "shutdown")
FAILED_SERVICE_STATE = "failed"
FAULT_CHECK_SECONDS = 30


def _create_fault(key: str, severity: str, source: str, title: str, detail: str = "") -> Fault:
    return {"key": key, "severity": severity, "source": source, "title": title, "detail": detail}


def _detect_throttling(readings: dict[str, Any]) -> list[Fault]:
    flags = readings.get("proc_stats", {}).get("throttled_state", {}).get("flags", [])
    known_flags = [THROTTLE_FAULTS[flag] for flag in flags if flag in THROTTLE_FAULTS]
    return [_create_fault(f"host.{key}", severity, "Host", title) for key, severity, title in known_flags]


def _detect_klipper(readings: dict[str, Any]) -> list[Fault]:
    printer_info = readings.get("printer_info", {})
    state = printer_info.get("state")
    if state in KLIPPER_FAULT_STATES:
        detail = printer_info.get("state_message", "")
        return [_create_fault(f"klipper.{state}", "error", "Klipper", f"Klipper {state}", detail)]
    if readings.get("server_info", {}).get("klippy_state") == "disconnected":
        return [_create_fault("klipper.disconnected", "error", "Klipper", "Klipper is not connected")]
    return []


def _detect_moonraker(readings: dict[str, Any]) -> list[Fault]:
    server_info = readings.get("server_info", {})
    warnings = [
        _create_fault(f"moonraker.warning.{text}", "warning", "Moonraker", "Moonraker warning", text)
        for text in server_info.get("warnings", [])
    ]
    failed = [
        _create_fault(f"moonraker.failed.{name}", "error", "Moonraker", "Moonraker component failed", name)
        for name in server_info.get("failed_components", [])
    ]
    return [*warnings, *failed]


def _detect_print(readings: dict[str, Any]) -> list[Fault]:
    print_stats = readings.get("objects", {}).get("print_stats", {})
    if print_stats.get("state") != "error":
        return []
    return [_create_fault("print.error", "error", "Print", "Print failed", print_stats.get("message", ""))]


def _detect_services(readings: dict[str, Any]) -> list[Fault]:
    states = readings.get("system_info", {}).get("service_state", {})
    return [
        _create_fault(f"service.{name}", "error", "Service", f"Service {name} failed", state.get("sub_state", ""))
        for name, state in states.items()
        if state.get("active_state") == FAILED_SERVICE_STATE
    ]


def _detect_boards(readings: dict[str, Any]) -> list[Fault]:
    faults = []
    for name, board in readings.get("objects", {}).items():
        invalid_bytes = board.get("last_stats", {}).get("bytes_invalid", 0) if name.startswith("mcu") else 0
        if invalid_bytes:
            detail = f"{invalid_bytes} invalid bytes on the connection"
            faults.append(_create_fault(f"board.{name}.invalid_bytes", "warning", name, "Board connection", detail))
    return faults


def _detect_driver(name: str, driver: dict[str, Any]) -> list[Fault]:
    status = driver.get("drv_status") or {}
    return [
        _create_fault(f"driver.{name}.{flag}", *DRIVER_FAULTS[flag][:1], name, DRIVER_FAULTS[flag][1].capitalize())
        for flag in sorted(status)
        if flag in DRIVER_FAULTS and status[flag]
    ]


def _detect_drivers(readings: dict[str, Any]) -> list[Fault]:
    objects = readings.get("objects", {})
    return [
        fault for name, driver in objects.items() if name.startswith("tmc") for fault in _detect_driver(name, driver)
    ]


_DETECTORS = (
    _detect_klipper,
    _detect_print,
    _detect_throttling,
    _detect_moonraker,
    _detect_services,
    _detect_boards,
    _detect_drivers,
)


def detect_faults(readings: dict[str, Any]) -> list[Fault]:
    """What is wrong right now. A host that does not answer leaves nothing else to look at."""
    if not readings.get("reachable", True):
        return [_create_fault("host.unreachable", "error", "Host", "The printer's host does not answer")]
    return [fault for detect in _DETECTORS for fault in detect(readings)]


async def check_system_faults(
    read_readings: Callable[[], Awaitable[dict[str, Any]]],
    database: Any,
    event_hub: Any,
    clock: Callable[[], float] = time.time,
) -> None:
    faults = detect_faults(await read_readings())
    await database.record_system_faults(faults, now=int(clock()))
    await database.prune_system_faults()
    await event_hub.broadcast("system_faults", {"active_count": len(faults)})


async def watch_system_faults(
    interval: int = FAULT_CHECK_SECONDS,
    moonraker_client: Any = moonraker,
    database: Any = default_database,
    event_hub: Any = hub,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Runs all the time, so a fault that clears overnight is still in the history."""

    async def read_readings() -> dict[str, Any]:
        return await read_host(moonraker_client)

    while True:
        try:
            await check_system_faults(read_readings, database, event_hub)
        except Exception as exc:
            log.warning("System fault check error: %s", exc)
        await sleep(interval)
