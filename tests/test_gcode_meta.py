import pytest
from app.gcode_meta import parse_custom_meta, map_moonraker_meta


def test_parse_custom_meta_basic():
    gcode = b"; meta:source_url=https://makerworld.com/models/123\n; meta:project_name=Benchy\nG28\n"
    result = parse_custom_meta(gcode)
    assert result == {"source_url": "https://makerworld.com/models/123", "project_name": "Benchy"}


def test_parse_custom_meta_empty():
    gcode = b"G28\nG1 X10 Y10\n"
    result = parse_custom_meta(gcode)
    assert result == {}


def test_parse_custom_meta_ignores_non_meta_comments():
    gcode = b"; FLAVOR:Marlin\n; TIME:3600\n; meta:source_url=https://example.com\n"
    result = parse_custom_meta(gcode)
    assert result == {"source_url": "https://example.com"}


def test_parse_custom_meta_skips_blank_values():
    gcode = b"; meta:source_url=\n; meta:project_name=Benchy\n"
    result = parse_custom_meta(gcode)
    assert result == {"project_name": "Benchy"}


def test_map_moonraker_meta_full():
    moonraker_data = {
        "layer_height": 0.2,
        "first_layer_height": 0.28,
        "filament_weight_total": 12.4,
        "estimated_time": 3600,
        "nozzle_diameter": [0.4],
        "filament_type": ["PLA"],
        "first_layer_extr_temp": 215,
        "first_layer_bed_temp": 60,
        "slicer": "Cura_SteamEngine",
        "slicer_version": "5.9.0",
        "layer_count": 120,
        "object_height": 24.0,
    }
    result = map_moonraker_meta(moonraker_data)
    assert result["layer_height"] == 0.2
    assert result["filament_weight_g"] == 12.4
    assert result["estimated_time_s"] == 3600
    assert result["nozzle_diameter"] == 0.4
    assert result["filament_type"] == "PLA"
    assert result["nozzle_temp"] == 215
    assert result["bed_temp"] == 60
    assert result["slicer"] == "Cura_SteamEngine"
    assert result["slicer_version"] == "5.9.0"
    assert result["layer_count"] == 120
    assert result["object_height"] == 24.0


def test_map_moonraker_meta_partial():
    result = map_moonraker_meta({"layer_height": 0.3})
    assert result == {"layer_height": 0.3}


def test_map_moonraker_meta_empty():
    result = map_moonraker_meta({})
    assert result == {}


def test_map_moonraker_meta_list_fields_single():
    result = map_moonraker_meta({"nozzle_diameter": [0.6], "filament_type": ["PETG"]})
    assert result["nozzle_diameter"] == 0.6
    assert result["filament_type"] == "PETG"


def test_map_moonraker_meta_list_fields_multi():
    result = map_moonraker_meta({"filament_type": ["PLA", "PLA"]})
    assert result["filament_type"] == "PLA"


def test_map_moonraker_meta_empty_list_skipped():
    result = map_moonraker_meta({"filament_type": [], "nozzle_diameter": []})
    assert "filament_type" not in result
    assert "nozzle_diameter" not in result
