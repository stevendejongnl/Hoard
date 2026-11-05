"""Sample data for the screenshots of the Control page: an idle printer, warm and ready to be moved."""

import math
from typing import Any

from frontend.parity.detection_fixture import DESKTOP_SIZE, PHONE_SIZE, DetectionScreen

JsonObject = dict[str, Any]

FIXED_CONSOLE_TIME = 1_792_000_000
MESH_SIZE = 7

STATUS = {
    "state": "standby",
    "locked": False,
    "position": {"x": 117.5, "y": 120.0, "z": 10.0},
    "homed": "xyz",
    "heaters": [
        {"key": "extruder", "label": "Nozzle", "temperature": 210.2, "target": 210},
        {"key": "heater_bed", "label": "Bed", "temperature": 59.8, "target": 60},
    ],
    "speed_percent": 100,
    "flow_percent": 100,
    "z_offset": -0.12,
    "manual_probe": {"active": False, "z": None},
    "fans": [
        {"key": "", "label": "Part fan", "percent": 0},
        {"key": "chamber", "label": "chamber", "percent": 40},
    ],
}
MACROS = ["BED_MESH_CALIBRATE", "CLEAN_NOZZLE", "LOAD_FILAMENT", "PARK", "UNLOAD_FILAMENT"]
CONSOLE_LINES = [
    ("command", "G28"),
    ("response", "ok"),
    ("command", "BED_MESH_CALIBRATE"),
    ("response", "Mesh Bed Leveling Complete"),
    ("command", "SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210"),
    ("response", "ok"),
]


def draw_bed_mesh() -> JsonObject:
    """A bed that dips a little at the front left and rises at the back right, in millimetres."""
    matrix = [
        [round(0.02 * (column - row) + 0.015 * math.sin(row + column), 3) for column in range(MESH_SIZE)]
        for row in range(MESH_SIZE)
    ]
    return {"profile_name": "default", "mesh_min": [20, 20], "mesh_max": [215, 215], "probed_matrix": matrix}


def create_console() -> list[JsonObject]:
    return [
        {"message": message, "time": FIXED_CONSOLE_TIME - (len(CONSOLE_LINES) - index) * 20, "type": kind}
        for index, (kind, message) in enumerate(CONSOLE_LINES)
    ]


def create_control_responses() -> dict[str, Any]:
    return {
        "/api/control/status": STATUS,
        "/api/control/macros": MACROS,
        "/api/control/console": create_console(),
        "/api/control/bed_mesh": draw_bed_mesh(),
        "/api/control/layout/desktop": None,
        "/api/control/layout/phone": None,
        "/api/control/klipper": {"state": "ready", "message": ""},
    }


def create_control_events() -> list[tuple[str, JsonObject]]:
    idle = {"state": "standby", "filename": None, "progress": 0, "time_remaining": None, "filament_used": 0}
    return [
        ("printer_state", idle),
        ("temps", {"hotend_actual": 210.2, "hotend_target": 210, "bed_actual": 59.8, "bed_target": 60}),
    ]


CONTROL_SHOWCASE_SCREENS = {
    "control-desktop": DetectionScreen("/control", DESKTOP_SIZE, "control.png"),
    "control-phone": DetectionScreen("/control", PHONE_SIZE, "control-phone.png"),
}
