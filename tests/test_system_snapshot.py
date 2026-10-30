from typing import Any

from app.system_snapshot import build_sections

PI_READINGS: dict[str, Any] = {
    "system_info": {
        "cpu_info": {
            "cpu_count": 4,
            "bits": "32bit",
            "processor": "armv7l",
            "cpu_desc": "ARMv7 Processor rev 4 (v7l)",
            "model": "Raspberry Pi 3 Model B Rev 1.2",
            "total_memory": 945364,
            "memory_units": "kB",
        },
        "distribution": {"name": "Debian GNU/Linux 11 (bullseye)"},
        "virtualization": {"virt_type": "none"},
        "sd_info": {"manufacturer": "Sandisk", "product_name": "SL16G", "capacity": "14.8 GiB"},
        "network": {"wlan0": {"mac_address": "aa:bb", "ip_addresses": [{"family": "ipv4", "address": "10.0.0.5"}]}},
        "available_services": ["klipper", "moonraker"],
        "service_state": {"klipper": {"active_state": "active", "sub_state": "running"}},
    },
    "proc_stats": {
        "cpu_temp": 48.25,
        "system_cpu_usage": {"cpu": 12.5, "cpu0": 10.0},
        "system_memory": {"total": 1000, "available": 400, "used": 600},
        "system_uptime": 3600,
        "websocket_connections": 2,
        "network": {"wlan0": {"rx_bytes": 2048, "tx_bytes": 1024, "bandwidth": 512.0}},
        "throttled_state": {"bits": 0, "flags": []},
    },
    "server_info": {"klippy_state": "ready", "moonraker_version": "v0.9.3", "api_version_string": "1.5.0"},
    "printer_info": {"state": "ready", "state_message": "Printer is ready", "software_version": "v0.12.0"},
    "objects": {
        "mcu": {
            "mcu_version": "v0.12.0",
            "mcu_constants": {"MCU": "stm32f103xe", "CLOCK_FREQ": 72000000},
            "last_stats": {"mcu_awake": 0.012, "bytes_retransmit": 9, "bytes_invalid": 0},
        },
        "mcu toolboard": {"mcu_version": "v0.11.0", "mcu_constants": {"MCU": "rp2040"}, "last_stats": {}},
        "extruder": {"temperature": 204.9, "target": 205.0, "power": 0.31},
        "heater_bed": {"temperature": 60.0, "target": 60.0, "power": 0.12},
        "temperature_sensor chamber": {"temperature": 31.5},
        "tmc2209 stepper_x": {"temperature": None, "run_current": 0.58, "hold_current": 0.58, "drv_status": {}},
        "toolhead": {"homed_axes": "xyz", "max_velocity": 300.0, "max_accel": 3000.0},
        "fan": {"speed": 0.5, "rpm": 3200},
        "filament_switch_sensor runout": {"enabled": True, "filament_detected": True},
        "system_stats": {"sysload": 0.42, "memavail": 512000},
        "some_future_object": {"anything": 1},
    },
}


def find_section(sections: list[dict[str, Any]], key: str) -> dict[str, Any] | None:
    return next((section for section in sections if section["key"] == key), None)


def read_rows(section: dict[str, Any] | None) -> dict[str, str]:
    assert section is not None
    return {row["label"]: row["value"] for row in section["rows"]}


def test_nothing_reported_gives_no_sections():
    assert build_sections({}) == []


def test_the_host_shows_what_it_is_and_how_it_is_doing():
    rows = read_rows(find_section(build_sections(PI_READINGS), "host"))
    assert rows["Model"] == "Raspberry Pi 3 Model B Rev 1.2"
    assert rows["CPU cores"] == "4"
    assert rows["CPU temperature"] == "48.2 °C"
    assert rows["CPU load"] == "12.5 %"
    assert rows["Memory used"] == "60.0 %"
    assert rows["Uptime"] == "1h 0m"


def test_a_host_that_reports_throttling_shows_under_voltage():
    rows = read_rows(find_section(build_sections(PI_READINGS), "host"))
    assert rows["Under-voltage"] == "No"


def test_under_voltage_says_when_it_is_happening_or_has_happened():
    flagged = {**PI_READINGS["proc_stats"], "throttled_state": {"bits": 1, "flags": ["Under-Voltage Detected"]}}
    rows = read_rows(find_section(build_sections({**PI_READINGS, "proc_stats": flagged}), "host"))
    assert rows["Under-voltage"] == "Yes, now"
    earlier = {**PI_READINGS["proc_stats"], "throttled_state": {"bits": 65536, "flags": ["Previously Under-Volted"]}}
    rows = read_rows(find_section(build_sections({**PI_READINGS, "proc_stats": earlier}), "host"))
    assert rows["Under-voltage"] == "Since boot"


def test_a_host_that_does_not_report_throttling_has_no_such_rows():
    proc_stats = {key: value for key, value in PI_READINGS["proc_stats"].items() if key != "throttled_state"}
    rows = read_rows(find_section(build_sections({**PI_READINGS, "proc_stats": proc_stats}), "host"))
    assert "Under-voltage" not in rows
    assert "Currently throttled" not in rows


def test_every_control_board_gets_its_own_section():
    sections = build_sections(PI_READINGS)
    main_board = read_rows(find_section(sections, "board.mcu"))
    assert main_board["Microcontroller"] == "stm32f103xe"
    assert main_board["Firmware"] == "v0.12.0"
    assert main_board["Bytes retransmit"] == "9"
    assert read_rows(find_section(sections, "board.mcu toolboard"))["Microcontroller"] == "rp2040"
    assert find_section(sections, "board.mcu toolboard")["title"] == "Control board: toolboard"


def test_temperatures_come_from_every_sensor_that_is_there():
    rows = read_rows(find_section(build_sections(PI_READINGS), "temperatures"))
    assert rows["Extruder"] == "204.9 °C / 205 °C"
    assert rows["Temperature sensor chamber"] == "31.5 °C"


def test_drivers_fans_motion_and_filament_sensors_are_listed():
    sections = build_sections(PI_READINGS)
    assert read_rows(find_section(sections, "drivers"))["Tmc2209 stepper_x run current"] == "0.58 A"
    assert read_rows(find_section(sections, "fans"))["Fan"] == "50 % · 3200 RPM"
    assert read_rows(find_section(sections, "motion"))["Homed axes"] == "xyz"
    assert read_rows(find_section(sections, "filament"))["Filament switch sensor runout"] == "Filament detected"


def test_software_network_services_and_storage_are_listed():
    sections = build_sections(PI_READINGS)
    assert read_rows(find_section(sections, "software"))["Klipper"] == "v0.12.0"
    assert read_rows(find_section(sections, "software"))["Moonraker"] == "v0.9.3"
    assert read_rows(find_section(sections, "services"))["klipper"] == "active (running)"
    assert read_rows(find_section(sections, "storage"))["Capacity"] == "14.8 GiB"
    assert read_rows(find_section(sections, "network"))["wlan0 address"] == "10.0.0.5"


def test_every_row_has_a_stable_key_within_its_section():
    for section in build_sections(PI_READINGS):
        keys = [row["key"] for row in section["rows"]]
        assert len(keys) == len(set(keys)), section["key"]
        assert all(key.startswith(f"{section['key']}.") for key in keys)


def test_an_object_of_an_unknown_kind_is_ignored():
    assert "some_future_object" not in str(build_sections(PI_READINGS))


def test_the_system_load_is_rounded():
    objects = {**PI_READINGS["objects"], "system_stats": {"sysload": 0.04443359375}}
    rows = read_rows(find_section(build_sections({**PI_READINGS, "objects": objects}), "host"))
    assert rows["System load"] == "0.04"
