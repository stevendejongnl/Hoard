"""Turns what Moonraker and Klipper report into sections of rows, for any hardware.

A row exists only when its value was reported, so a value such as under-voltage shows up on a host that has
it and nowhere else, and every extra board, sensor or driver gets its rows without further code.
"""

from collections.abc import Callable
from typing import Any

Row = tuple[str, str, Any]
Section = dict[str, Any]

BOARD_PREFIX = "mcu"
TEMPERATURE_PREFIXES = (
    "extruder",
    "heater_bed",
    "heater_generic",
    "temperature_sensor",
    "temperature_fan",
    "temperature_probe",
    "temperature_host",
    "temperature_combined",
)
DRIVER_PREFIXES = ("tmc",)
FAN_PREFIXES = ("fan", "heater_fan", "controller_fan", "fan_generic", "temperature_fan")
FILAMENT_PREFIXES = ("filament_switch_sensor", "filament_motion_sensor")
SHOWN_OBJECT_PREFIXES = (
    BOARD_PREFIX,
    *TEMPERATURE_PREFIXES,
    *DRIVER_PREFIXES,
    *FAN_PREFIXES,
    *FILAMENT_PREFIXES,
    "toolhead",
    "system_stats",
)
UNDER_VOLTAGE_FLAGS = ("Under-Voltage Detected", "Previously Under-Volted")
THROTTLE_ROWS = (
    ("Frequency capped", "Frequency Capped", "Previously Frequency Capped"),
    ("Currently throttled", "Currently Throttled", "Previously Throttled"),
    ("Temperature limit", "Temperature Limit Active", "Previously Temperature Limited"),
)


def is_shown_object(name: str) -> bool:
    return name.split(" ", maxsplit=1)[0].startswith(SHOWN_OBJECT_PREFIXES)


def _humanize(name: str) -> str:
    """The kind of an object reads as words; the name after it stays as it is in the Klipper configuration."""
    kind, _, own_name = name.partition(" ")
    return f"{kind.replace('_', ' ').capitalize()} {own_name}".strip()


def _object_kind(name: str) -> str:
    return name.split(" ", maxsplit=1)[0]


def _objects_of_kinds(readings: dict[str, Any], prefixes: tuple[str, ...]) -> list[tuple[str, dict[str, Any]]]:
    objects = readings.get("objects", {})
    return [(name, value) for name, value in objects.items() if _object_kind(name).startswith(prefixes)]


def _format_with_unit(value: Any, unit: str, decimals: int = 1) -> str | None:
    if value is None:
        return None
    return f"{value:.{decimals}f} {unit}"


def _format_duration(seconds: Any) -> str | None:
    if seconds is None:
        return None
    hours, remainder = divmod(int(seconds), 3600)
    return f"{hours}h {remainder // 60}m"


def _format_bytes(count: Any) -> str | None:
    if count is None:
        return None
    size = float(count)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _format_percentage_used(memory: dict[str, Any]) -> str | None:
    if not memory.get("total"):
        return None
    return f"{memory.get('used', 0) / memory['total'] * 100:.1f} %"


def _format_memory_total(cpu_info: dict[str, Any]) -> str | None:
    if cpu_info.get("total_memory") is None:
        return None
    return f"{cpu_info['total_memory']} {cpu_info.get('memory_units', '')}".strip()


def _format_flag(flags: list[str], current: str, earlier: str) -> str:
    if current in flags:
        return "Yes, now"
    return "Since boot" if earlier in flags else "No"


def _create_section(key: str, title: str, rows: list[Row]) -> Section | None:
    shown = [
        {"key": f"{key}.{row_key}", "label": label, "value": str(value)}
        for row_key, label, value in rows
        if value not in (None, "")
    ]
    return {"key": key, "title": title, "rows": shown} if shown else None


def _throttle_rows(proc_stats: dict[str, Any]) -> list[Row]:
    throttled_state = proc_stats.get("throttled_state")
    if throttled_state is None:
        return []
    flags = throttled_state.get("flags", [])
    rows: list[Row] = [("under_voltage", "Under-voltage", _format_flag(flags, *UNDER_VOLTAGE_FLAGS))]
    for label, current, earlier in THROTTLE_ROWS:
        rows.append((label.lower().replace(" ", "_"), label, _format_flag(flags, current, earlier)))
    return rows


def _core_rows(proc_stats: dict[str, Any]) -> list[Row]:
    usage = proc_stats.get("system_cpu_usage", {})
    return [(name, name.upper(), _format_with_unit(value, "%")) for name, value in usage.items() if name != "cpu"]


def _build_host(readings: dict[str, Any]) -> Section | None:
    system_info = readings.get("system_info", {})
    proc_stats = readings.get("proc_stats", {})
    cpu_info = system_info.get("cpu_info", {})
    usage = proc_stats.get("system_cpu_usage", {})
    stats = readings.get("objects", {}).get("system_stats", {})
    rows: list[Row] = [
        ("model", "Model", cpu_info.get("model")),
        ("hardware", "Hardware", cpu_info.get("hardware_desc")),
        ("processor", "Processor", cpu_info.get("cpu_desc")),
        ("architecture", "Architecture", cpu_info.get("processor")),
        ("bits", "Bits", cpu_info.get("bits")),
        ("cpu_cores", "CPU cores", cpu_info.get("cpu_count")),
        ("memory_total", "Memory", _format_memory_total(cpu_info)),
        ("operating_system", "Operating system", system_info.get("distribution", {}).get("name")),
        ("virtualization", "Virtualization", system_info.get("virtualization", {}).get("virt_type")),
        ("cpu_temperature", "CPU temperature", _format_with_unit(proc_stats.get("cpu_temp"), "°C")),
        ("cpu_load", "CPU load", _format_with_unit(usage.get("cpu"), "%")),
        *_core_rows(proc_stats),
        ("memory_used", "Memory used", _format_percentage_used(proc_stats.get("system_memory", {}))),
        ("system_load", "System load", stats.get("sysload")),
        ("uptime", "Uptime", _format_duration(proc_stats.get("system_uptime"))),
        ("connections", "Websocket connections", proc_stats.get("websocket_connections")),
        *_throttle_rows(proc_stats),
    ]
    return _create_section("host", "Host", rows)


def _build_software(readings: dict[str, Any]) -> Section | None:
    server_info = readings.get("server_info", {})
    printer_info = readings.get("printer_info", {})
    rows: list[Row] = [
        ("klipper", "Klipper", printer_info.get("software_version")),
        ("klipper_state", "Klipper state", printer_info.get("state") or server_info.get("klippy_state")),
        ("klipper_message", "Klipper message", printer_info.get("state_message")),
        ("moonraker", "Moonraker", server_info.get("moonraker_version")),
        ("moonraker_api", "Moonraker API", server_info.get("api_version_string")),
    ]
    return _create_section("software", "Software", rows)


def _build_storage(readings: dict[str, Any]) -> Section | None:
    storage = readings.get("system_info", {}).get("sd_info", {})
    return _create_section("storage", "Storage", [(key, _humanize(key), value) for key, value in storage.items()])


def _build_board(name: str, board: dict[str, Any]) -> Section | None:
    constants = board.get("mcu_constants", {})
    rows: list[Row] = [
        ("microcontroller", "Microcontroller", constants.get("MCU")),
        ("firmware", "Firmware", board.get("mcu_version")),
        ("build", "Build", board.get("mcu_build_versions")),
    ]
    rows += [(f"stats_{key}", _humanize(key), value) for key, value in board.get("last_stats", {}).items()]
    rows += [(f"constant_{key}", key, value) for key, value in constants.items() if key != "MCU"]
    suffix = name.removeprefix(BOARD_PREFIX).strip()
    return _create_section(f"board.{name}", f"Control board: {suffix}" if suffix else "Control board", rows)


def _build_boards(readings: dict[str, Any]) -> list[Section | None]:
    boards = readings.get("objects", {})
    return [_build_board(name, board) for name, board in boards.items() if _object_kind(name) == BOARD_PREFIX]


def _format_temperature(sensor: dict[str, Any]) -> str | None:
    temperature = _format_with_unit(sensor.get("temperature"), "°C")
    if temperature is None or sensor.get("target") is None:
        return temperature
    return f"{temperature} / {sensor['target']:.0f} °C"


def _build_temperatures(readings: dict[str, Any]) -> Section | None:
    sensors = _objects_of_kinds(readings, TEMPERATURE_PREFIXES)
    rows: list[Row] = [(name, _humanize(name), _format_temperature(sensor)) for name, sensor in sensors]
    return _create_section("temperatures", "Temperatures", rows)


def _driver_rows(name: str, driver: dict[str, Any]) -> list[Row]:
    label = _humanize(name)
    faults = ", ".join(sorted(driver.get("drv_status") or {}))
    return [
        (f"{name}_temperature", f"{label} temperature", _format_with_unit(driver.get("temperature"), "°C")),
        (f"{name}_run_current", f"{label} run current", _format_with_unit(driver.get("run_current"), "A", 2)),
        (f"{name}_hold_current", f"{label} hold current", _format_with_unit(driver.get("hold_current"), "A", 2)),
        (f"{name}_status", f"{label} status", faults),
    ]


def _build_drivers(readings: dict[str, Any]) -> Section | None:
    rows: list[Row] = []
    for name, driver in _objects_of_kinds(readings, DRIVER_PREFIXES):
        rows += _driver_rows(name, driver)
    return _create_section("drivers", "Stepper drivers", rows)


def _format_fan(fan: dict[str, Any]) -> str | None:
    if fan.get("speed") is None:
        return None
    speed = f"{fan['speed'] * 100:.0f} %"
    return f"{speed} · {fan['rpm']:.0f} RPM" if fan.get("rpm") is not None else speed


def _build_fans(readings: dict[str, Any]) -> Section | None:
    fans = _objects_of_kinds(readings, FAN_PREFIXES)
    return _create_section("fans", "Fans", [(name, _humanize(name), _format_fan(fan)) for name, fan in fans])


def _build_motion(readings: dict[str, Any]) -> Section | None:
    toolhead = readings.get("objects", {}).get("toolhead", {})
    rows: list[Row] = [
        ("homed_axes", "Homed axes", toolhead.get("homed_axes")),
        ("max_velocity", "Maximum velocity", _format_with_unit(toolhead.get("max_velocity"), "mm/s", 0)),
        ("max_accel", "Maximum acceleration", _format_with_unit(toolhead.get("max_accel"), "mm/s²", 0)),
    ]
    return _create_section("motion", "Motion", rows)


def _format_filament_sensor(sensor: dict[str, Any]) -> str:
    if not sensor.get("enabled", True):
        return "Disabled"
    return "Filament detected" if sensor.get("filament_detected") else "No filament"


def _build_filament(readings: dict[str, Any]) -> Section | None:
    sensors = _objects_of_kinds(readings, FILAMENT_PREFIXES)
    rows: list[Row] = [(name, _humanize(name), _format_filament_sensor(sensor)) for name, sensor in sensors]
    return _create_section("filament", "Filament sensors", rows)


def _address_rows(interfaces: dict[str, Any]) -> list[Row]:
    rows: list[Row] = []
    for name, interface in interfaces.items():
        addresses = ", ".join(item.get("address", "") for item in interface.get("ip_addresses", []))
        rows.append((f"{name}_address", f"{name} address", addresses))
    return rows


def _traffic_rows(interfaces: dict[str, Any]) -> list[Row]:
    rows: list[Row] = []
    for name, traffic in interfaces.items():
        rows.append((f"{name}_received", f"{name} received", _format_bytes(traffic.get("rx_bytes"))))
        rows.append((f"{name}_sent", f"{name} sent", _format_bytes(traffic.get("tx_bytes"))))
    return rows


def _build_network(readings: dict[str, Any]) -> Section | None:
    addresses = _address_rows(readings.get("system_info", {}).get("network", {}))
    traffic = _traffic_rows(readings.get("proc_stats", {}).get("network", {}))
    return _create_section("network", "Network", [*addresses, *traffic])


def _describe_service(state: dict[str, Any]) -> str:
    return f"{state.get('active_state', 'unknown')} ({state.get('sub_state', 'unknown')})"


def _build_services(readings: dict[str, Any]) -> Section | None:
    states = readings.get("system_info", {}).get("service_state", {})
    return _create_section("services", "Services", [(name, name, _describe_service(s)) for name, s in states.items()])


_SINGLE_SECTION_BUILDERS: tuple[Callable[[dict[str, Any]], Section | None], ...] = (
    _build_host,
    _build_software,
    _build_temperatures,
    _build_drivers,
    _build_fans,
    _build_motion,
    _build_filament,
    _build_storage,
    _build_network,
    _build_services,
)


def build_sections(readings: dict[str, Any]) -> list[Section]:
    """Host and software first, then the boards, then the rest; a section with nothing reported is left out."""
    single_sections = [build(readings) for build in _SINGLE_SECTION_BUILDERS]
    sections = [*single_sections[:2], *_build_boards(readings), *single_sections[2:]]
    return [section for section in sections if section is not None]
