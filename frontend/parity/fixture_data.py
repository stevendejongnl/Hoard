"""The data the design screens show, in the shapes the app's API returns.

The mock backend serves this so every screen of the app can be compared with its reference image.
"""

import math
from datetime import datetime
from typing import Any

JsonObject = dict[str, Any]

PRINTING_FILENAME = "Piedistallo+per+lego+F1+2Posti.gcode"
CREATED_AT_TIMESTAMP = 1_780_000_000


def create_spool(
    identifier: int, brand: str, material: str, color: str, color_hex: str, cost_per_gram: float, current_weight_g: int
) -> JsonObject:
    return {
        "id": identifier,
        "brand": brand,
        "material": material,
        "color": color,
        "color_hex": color_hex,
        "cost_per_gram": cost_per_gram,
        "initial_weight_g": 1000,
        "current_weight_g": current_weight_g,
        "notes": None,
        "active": 1 if identifier == 1 else 0,
        "created_at": CREATED_AT_TIMESTAMP,
    }


def create_fixture_spools() -> list[JsonObject]:
    return [
        create_spool(1, "Sunlu", "PLA Plus", "White", "#F8FAFC", 0.010, 840),
        create_spool(2, "eSUN", "PLA", "Black", "#111827", 0.012, 612),
        create_spool(3, "Generic", "PLA", "Grey", "#9CA3AF", 0.015, 310),
    ]


def create_spool_reference(spool: JsonObject | None) -> JsonObject | None:
    if spool is None:
        return None
    keys = ("id", "brand", "material", "color", "color_hex")
    return {key: spool[key] for key in keys}


# filename, date, duration in seconds, filament in grams, spool identifier, total cost, project identifier
HISTORY_ROWS = [
    (PRINTING_FILENAME, "2026-06-04", 13080, 36.5, None, 0.00, 3),
    (PRINTING_FILENAME, "2026-06-03", 13080, 36.5, None, 0.00, 3),
    ("helicopter-blade.gcode", "2026-05-26", 660, 3.8, 2, 0.04, None),
    ("helicopter-blade.gcode", "2026-05-26", 660, 3.8, 1, 0.04, None),
    ("dactyl-manuform-dm-5x6-plate-r.gcode", "2026-05-22", 10740, 43.3, 1, 0.43, 1),
    ("dactyl-manuform-dm-5x6-plate.gcode", "2026-05-21", 10740, 43.3, 1, 0.43, 1),
    ("tap_cover_plate.gcode", "2026-05-19", 2820, 10.8, 3, 0.17, None),
    ("tap_cover_plate.gcode", "2026-05-19", 2820, 10.8, 3, 0.17, None),
    ("bit driver.gcode", "2026-05-17", 6960, 30.6, 3, 0.47, None),
    ("ASX1_Stokke steps - Footrest r.gcode", "2026-05-02", 19920, 103.5, 3, 1.55, None),
    ("Doorhandle/Doorhandle_body.gcode", "2026-04-30", 13440, 69.2, 3, 1.04, 2),
    ("Doorhandle_parts.gcode", "2026-04-28", 10800, 57.3, 3, 0.86, 2),
]

PROJECT_NAMES = {1: "Dactyl Manuform", 2: "Doorhandle", 3: "Lego F1 stand", 4: "Voron 2.4"}
SELECTED_HISTORY_INDEX = 5


def create_history_record(index: int, row: tuple, spools: list[JsonObject]) -> JsonObject:
    filename, date, duration_seconds, filament_grams, spool_identifier, total_cost, project_identifier = row
    spool = spools[spool_identifier - 1] if spool_identifier else None
    is_selected = index == SELECTED_HISTORY_INDEX
    return {
        "job_id": f"job-{index:03d}",
        "time": f"{date}T12:00:00+00:00",
        "filename": filename,
        "status": "completed",
        "duration_s": duration_seconds,
        "filament_g": filament_grams,
        "avg_watts": 105 if is_selected else 100,
        "avg_eur_per_kwh": 0.16,
        "cost_filament": 0.38 if is_selected else round(total_cost * 0.9, 2),
        "cost_electricity": 0.05 if is_selected else round(total_cost * 0.1, 2),
        "cost_total": total_cost,
        "spool_id": str(spool_identifier) if spool_identifier else None,
        "material": spool["material"] if spool else None,
        "spool": create_spool_reference(spool),
        "project": {"id": project_identifier, "name": PROJECT_NAMES[project_identifier]} if project_identifier else None,
        "has_detail": True,
        "photo_count": 0,
    }


def create_fixture_history() -> JsonObject:
    spools = create_fixture_spools()
    records = [create_history_record(index, row, spools) for index, row in enumerate(HISTORY_ROWS)]
    return {"records": records, "total": 20}


DASHBOARD_HISTORY_INDEXES = (0, 2, 5, 6)


def create_dashboard_history() -> JsonObject:
    """The four prints the design lists on the dashboard: one per file, the latest first."""
    records = create_fixture_history()["records"]
    return {"records": [records[index] for index in DASHBOARD_HISTORY_INDEXES], "total": 20}


TEMPERATURE_WINDOW_SECONDS = 600
TEMPERATURE_INTERVAL_SECONDS = 5
ROOM_TEMPERATURE = 24
HEATING_AGE_SECONDS = 415
HOTEND_TARGET = 205
BED_TARGET = 60
HOTEND_RISE_SECONDS = 170
BED_RISE_SECONDS = 230


def calculate_hotend_temperature(age_seconds: int) -> float:
    seconds_heating = HEATING_AGE_SECONDS - age_seconds
    if seconds_heating <= 0:
        return ROOM_TEMPERATURE
    if seconds_heating < HOTEND_RISE_SECONDS:
        remaining_share = 1 - seconds_heating / HOTEND_RISE_SECONDS
        return ROOM_TEMPERATURE + (HOTEND_TARGET - ROOM_TEMPERATURE) * (1 - remaining_share**2)
    return HOTEND_TARGET + 0.4 * math.sin((seconds_heating - HOTEND_RISE_SECONDS) / 56 * 2 * math.pi)


def calculate_bed_temperature(age_seconds: int) -> float:
    seconds_heating = HEATING_AGE_SECONDS - age_seconds
    if seconds_heating <= 0:
        return ROOM_TEMPERATURE
    if seconds_heating < BED_RISE_SECONDS:
        return ROOM_TEMPERATURE + (BED_TARGET - ROOM_TEMPERATURE) * seconds_heating / BED_RISE_SECONDS
    return BED_TARGET + 0.1 * math.sin((seconds_heating - BED_RISE_SECONDS) / 40 * 2 * math.pi)


def create_temperature_sample(age_seconds: int) -> JsonObject:
    is_heating = age_seconds <= HEATING_AGE_SECONDS
    return {
        "age_seconds": age_seconds,
        "hotend_actual": round(calculate_hotend_temperature(age_seconds), 2),
        "hotend_target": HOTEND_TARGET if is_heating else 0,
        "bed_actual": round(calculate_bed_temperature(age_seconds), 2),
        "bed_target": BED_TARGET if is_heating else 0,
    }


def create_temperature_history() -> JsonObject:
    ages = range(TEMPERATURE_WINDOW_SECONDS, -1, -TEMPERATURE_INTERVAL_SECONDS)
    return {"samples": [create_temperature_sample(age) for age in ages]}


# filename, size in bytes, estimated seconds, filament grams
FILE_ROWS = [
    ("helicopter-blade.gcode", 4194304, 660, 3.8),
    ("dactyl-manuform-dm-5x6-plate.gcode", 6501171, 10740, 43.3),
    ("tap_cover_plate.gcode", 1153434, 2820, 10.8),
]


def create_fixture_files() -> list[JsonObject]:
    return [
        {
            "filename": name,
            "size": size,
            "modified": CREATED_AT_TIMESTAMP,
            "estimated_time": seconds,
            "filament_weight_total": grams,
        }
        for name, size, seconds, grams in FILE_ROWS
    ]


PRINT_JOB_INDEX = 2
PRINT_JOB_NOTES = "First layer needed a higher bed temperature."


def create_fixture_print_job() -> JsonObject:
    record = create_fixture_history()["records"][PRINT_JOB_INDEX]
    return {
        **record,
        "notes": PRINT_JOB_NOTES,
        "settings": None,
        "photos": [],
        "created_at": CREATED_AT_TIMESTAMP,
        "cost_filament": 0.03,
        "cost_electricity": 0.01,
        "avg_watts": 105,
        "project": {"id": 2, "name": "Doorhandle"},
        "gcode_meta": {
            "layer_height": 0.2,
            "nozzle_diameter": 0.4,
            "filament_type": "PLA",
            "nozzle_temp": 205,
            "bed_temp": 60,
        },
    }


def create_fixture_search() -> JsonObject:
    records = [record for record in create_fixture_history()["records"] if "Doorhandle" in record["filename"]]
    history = [
        {
            "job_id": record["job_id"],
            "filename": record["filename"],
            "time": int(datetime.fromisoformat(record["time"]).timestamp()),
            "duration_s": record["duration_s"],
        }
        for record in records
    ]
    return {"history": history, "spools": [], "projects": [{"id": 2, "name": "Doorhandle", "print_count": 2}]}


def create_fixture_prediction() -> JsonObject:
    return {
        "filename": "helicopter-blade.gcode",
        "quantity": 1,
        "spool_id": 2,
        "material": "PLA",
        "filament_g": 3.8,
        "estimated_time_s": 660,
        "layer_count": 60,
        "avg_watts": 100,
        "avg_eur_per_kwh": 0.16,
        "cost_filament": 0.04,
        "cost_electricity": 0.0,
        "cost_total": 0.04,
    }


def create_project(
    identifier: int, print_count: int, duration_seconds: int | None, filament_grams: float | None, cost: float | None
) -> JsonObject:
    has_prints = print_count > 0
    return {
        "id": identifier,
        "name": PROJECT_NAMES[identifier],
        "notes": None,
        "created_at": CREATED_AT_TIMESTAMP,
        "print_count": print_count,
        "total_duration_s": duration_seconds,
        "avg_duration_s": duration_seconds // print_count if has_prints and duration_seconds else None,
        "max_duration_s": duration_seconds // print_count if has_prints and duration_seconds else None,
        "total_cost": cost,
        "avg_cost": round(cost / print_count, 2) if has_prints and cost is not None else None,
        "total_filament_g": filament_grams,
        "cover_url": None,
        "cover_link_id": None,
    }


def create_fixture_projects() -> list[JsonObject]:
    return [
        create_project(1, 2, 21480, 86.6, 0.86),
        create_project(2, 2, 24240, 126.5, 1.90),
        create_project(3, 2, 26160, 73.0, 0.00),
        create_project(4, 0, None, None, None),
    ]


def create_project_print(identifier: int, job_index: int, file_identifier: int) -> JsonObject:
    return {
        "id": identifier,
        "project_id": 1,
        "project_file_id": file_identifier,
        "job_id": f"job-{job_index:03d}",
        "duration_s": 10740,
        "filament_g": 43.3,
        "cost_total": 0.43,
    }


def create_fixture_project_detail() -> JsonObject:
    detail = create_fixture_projects()[0]
    detail["notes"] = "[Project notes. Markdown is supported: settings, mods, build log.]"
    detail["files"] = [
        {
            "id": 1,
            "project_id": 1,
            "type": "gcode",
            "filename": "dactyl-manuform-dm-5x6-plate.gcode",
            "label": None,
            "print_count": 2,
            "total_duration_s": 21480,
            "total_cost": 0.86,
            "total_filament_g": 86.6,
        }
    ]
    detail["links"] = [
        {
            "id": 1,
            "project_id": 1,
            "url": "https://www.printables.com/model/dactyl-manuform",
            "label": None,
            "meta": {"title": "[Link preview title]", "description": None, "image_url": None, "print_settings": None},
        }
    ]
    detail["prints"] = [create_project_print(1, 4, 1), create_project_print(2, 5, 1)]
    return detail


def create_fixture_webcams() -> list[JsonObject]:
    return [
        {
            "name": "Enclosure",
            "stream_url": "/webcam/enclosure/stream",
            "snapshot_url": "/webcam/enclosure/snapshot",
            "flip_horizontal": False,
            "flip_vertical": False,
            "rotation": 0,
            "enabled": True,
            "aspect_ratio": "4:3",
            "target_fps": 15,
        }
    ]


def create_fixture_file_metadata() -> JsonObject:
    return {
        "filename": PRINTING_FILENAME,
        "size": 4_200_000,
        "modified": CREATED_AT_TIMESTAMP,
        "filament_weight_total": 36.5,
        "estimated_time": 12840,
        "layer_height": 0.2,
        "first_layer_height": 0.2,
        "layer_count": 180,
    }


def create_fixture_responses() -> dict[str, Any]:
    return {
        "/api/version": {"version": "dev"},
        "/api/spools": create_fixture_spools(),
        "/api/history": create_fixture_history(),
        "/api/history?limit=4&offset=0": create_dashboard_history(),
        "/api/temperatures/history": create_temperature_history(),
        "/api/predict": create_fixture_prediction(),
        "/api/prints/job-002": create_fixture_print_job(),
        "/api/search?q=door": create_fixture_search(),
        "/api/projects": create_fixture_projects(),
        "/api/projects/1": create_fixture_project_detail(),
        "/api/webcams": create_fixture_webcams(),
        "/api/files": create_fixture_files(),
        "/api/files/metadata": create_fixture_file_metadata(),
        "/api/push/vapid-public-key": {"key": None},
    }


def create_fixture_events() -> list[tuple[str, JsonObject]]:
    return [
        (
            "printer_state",
            {
                "state": "printing",
                "filename": PRINTING_FILENAME,
                "progress": 1.8,
                "layer": None,
                "layer_total": None,
                "time_remaining": 415,
                "filament_used": 660,
                "speed": 30,
                "z_position": 0.6,
            },
        ),
        ("temps", {"hotend_actual": 204.9, "hotend_target": 205, "bed_actual": 60, "bed_target": 60}),
        ("power", {"watts": 109, "eur_per_kwh": 0.16, "switch": "on"}),
        ("pi_stats", {"cpu_temp": 37.6, "cpu_load": 3.9, "memory_pct": 32.1, "disk_pct": 66.2, "uptime_s": 85140}),
    ]
