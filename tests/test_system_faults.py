from typing import Any

from app.system_faults import check_system_faults, detect_faults

HEALTHY: dict[str, Any] = {
    "reachable": True,
    "proc_stats": {"throttled_state": {"bits": 0, "flags": []}},
    "server_info": {"klippy_state": "ready", "warnings": [], "failed_components": []},
    "printer_info": {"state": "ready", "state_message": "Printer is ready"},
    "system_info": {"service_state": {"klipper": {"active_state": "active", "sub_state": "running"}}},
    "objects": {
        "mcu": {"last_stats": {"bytes_invalid": 0}},
        "print_stats": {"state": "standby", "message": ""},
        "tmc2209 stepper_x": {"drv_status": {"cs_actual": 16}},
    },
}


def read_keys(readings: dict[str, Any]) -> list[str]:
    return [fault["key"] for fault in detect_faults(readings)]


def find_fault(readings: dict[str, Any], key: str) -> dict[str, Any]:
    return next(fault for fault in detect_faults(readings) if fault["key"] == key)


def test_a_healthy_printer_has_no_faults():
    assert detect_faults(HEALTHY) == []


def test_a_host_that_does_not_answer_is_a_fault():
    assert read_keys({"reachable": False}) == ["host.unreachable"]


def test_under_voltage_now_is_an_error_and_earlier_a_warning():
    now = {**HEALTHY, "proc_stats": {"throttled_state": {"bits": 1, "flags": ["Under-Voltage Detected"]}}}
    assert find_fault(now, "host.under_voltage")["severity"] == "error"
    earlier = {**HEALTHY, "proc_stats": {"throttled_state": {"bits": 1, "flags": ["Previously Under-Volted"]}}}
    assert find_fault(earlier, "host.previously_under_volted")["severity"] == "warning"


def test_a_host_without_throttling_information_is_not_a_fault():
    assert detect_faults({**HEALTHY, "proc_stats": {}}) == []


def test_klipper_in_error_or_shutdown_shows_why():
    printer_info = {"state": "shutdown", "state_message": "MCU 'mcu' shutdown: Timer too close"}
    fault = find_fault({**HEALTHY, "printer_info": printer_info}, "klipper.shutdown")
    assert fault["severity"] == "error"
    assert fault["detail"] == "MCU 'mcu' shutdown: Timer too close"


def test_klipper_not_connected_to_moonraker_is_a_fault():
    server_info = {**HEALTHY["server_info"], "klippy_state": "disconnected"}
    assert "klipper.disconnected" in read_keys({**HEALTHY, "server_info": server_info, "printer_info": {}})


def test_moonraker_warnings_and_failed_components_are_faults():
    server_info = {**HEALTHY["server_info"], "warnings": ["bad config"], "failed_components": ["power"]}
    keys = read_keys({**HEALTHY, "server_info": server_info})
    assert "moonraker.warning.bad config" in keys
    assert "moonraker.failed.power" in keys


def test_a_failed_print_shows_the_message():
    objects = {**HEALTHY["objects"], "print_stats": {"state": "error", "message": "Move out of range"}}
    assert find_fault({**HEALTHY, "objects": objects}, "print.error")["detail"] == "Move out of range"


def test_a_failed_service_is_a_fault():
    states = {"klipper": {"active_state": "failed", "sub_state": "failed"}}
    assert "service.klipper" in read_keys({**HEALTHY, "system_info": {"service_state": states}})


def test_invalid_bytes_on_a_board_connection_is_a_warning():
    objects = {**HEALTHY["objects"], "mcu toolboard": {"last_stats": {"bytes_invalid": 12}}}
    fault = find_fault({**HEALTHY, "objects": objects}, "board.mcu toolboard.invalid_bytes")
    assert fault["severity"] == "warning"


def test_a_stepper_driver_fault_flag_is_a_fault_but_ordinary_status_is_not():
    objects = {**HEALTHY["objects"], "tmc2209 stepper_x": {"drv_status": {"cs_actual": 16, "ot": 1, "s2ga": 1}}}
    keys = read_keys({**HEALTHY, "objects": objects})
    assert keys == ["driver.tmc2209 stepper_x.ot", "driver.tmc2209 stepper_x.s2ga"]


async def test_the_watcher_stores_the_faults_and_announces_how_many_are_active():
    stored: list[tuple[list[dict[str, Any]], int]] = []
    announced: list[tuple[str, Any]] = []

    class FakeDatabase:
        async def record_system_faults(self, faults: list[dict[str, Any]], now: int) -> None:
            stored.append((faults, now))

        async def prune_system_faults(self) -> None:
            return None

    class FakeHub:
        async def broadcast(self, kind: str, data: Any) -> None:
            announced.append((kind, data))

    async def read_readings() -> dict[str, Any]:
        return {"reachable": False}

    await check_system_faults(read_readings, FakeDatabase(), FakeHub(), clock=lambda: 500.0)
    assert [fault["key"] for fault in stored[0][0]] == ["host.unreachable"]
    assert stored[0][1] == 500
    assert announced == [("system_faults", {"active_count": 1})]
