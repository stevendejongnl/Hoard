import logging
import math
import re
from collections.abc import Callable
from typing import Any

from app.moonraker import moonraker

log = logging.getLogger(__name__)

_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001


def parse_custom_meta(gcode_bytes: bytes) -> dict[str, str]:
    """Parse '; meta:key=value' lines from gcode header (first 64 KB).

    Returns a dict of key → value strings. Skips blank values.
    """
    header = gcode_bytes[:65536].decode("ascii", errors="ignore")
    result: dict[str, str] = {}
    for line in header.splitlines():
        m = re.match(r";\s*meta:([A-Za-z0-9_]+)=(.+)", line)
        if m:
            key = m.group(1).strip()
            value = m.group(2).strip()
            if value:
                result[key] = value
    return result


def _read_time(line: str, result: dict[str, Any]) -> bool:
    """;TIME:12890"""
    if not (match := re.match(r";TIME:(\d+)", line)):
        return False
    result.setdefault("estimated_time_s", int(match.group(1)))
    return True


def _read_layer_height(line: str, result: dict[str, Any]) -> bool:
    """;Layer height: 0.2"""
    if not (match := re.match(r";Layer height:\s*([\d.]+)", line, re.IGNORECASE)):
        return False
    result.setdefault("layer_height", float(match.group(1)))
    return True


def _read_filament_used(line: str, result: dict[str, Any]) -> bool:
    """;Filament used: 12.2151m  (meters to grams)"""
    if not (match := re.match(r";Filament used:\s*([\d.]+)m", line, re.IGNORECASE)):
        return False
    millimeters = float(match.group(1)) * 1000
    result.setdefault("filament_weight_g", round(millimeters * _MM_TO_GRAMS, 2))
    return True


def _read_slicer(line: str, result: dict[str, Any]) -> bool:
    """;Generated with Cura_SteamEngine 5.12.0"""
    if not (match := re.match(r";Generated with (\S+)\s+([\d.]+)", line, re.IGNORECASE)):
        return False
    result.setdefault("slicer", match.group(1))
    result.setdefault("slicer_version", match.group(2))
    return True


def _read_first_layer_height(line: str, result: dict[str, Any]) -> bool:
    """;MINZ:0.3 is the first layer height."""
    if not (match := re.match(r";MINZ:([\d.]+)", line)):
        return False
    value = float(match.group(1))
    if value > 0:
        result.setdefault("first_layer_height", value)
    return True


def _read_object_height(line: str, result: dict[str, Any]) -> bool:
    """;MAXZ:82.6 is the object height."""
    if not (match := re.match(r";MAXZ:([\d.]+)", line)):
        return False
    result.setdefault("object_height", float(match.group(1)))
    return True


def _read_start_print_temperatures(line: str, result: dict[str, Any]) -> bool:
    """START_PRINT BED_TEMP=60 EXTRUDER_TEMP=205"""
    if not line.upper().startswith("START_PRINT"):
        return False
    if bed_match := re.search(r"BED_TEMP=([\d.]+)", line, re.IGNORECASE):
        result.setdefault("bed_temp", int(float(bed_match.group(1))))
    if nozzle_match := re.search(r"EXTRUDER_TEMP=([\d.]+)", line, re.IGNORECASE):
        result.setdefault("nozzle_temp", int(float(nozzle_match.group(1))))
    return True


def _read_temperature_command(line: str, result: dict[str, Any], pattern: str, wait_code: str, key: str) -> bool:
    """Older Cura: M104/M109 S<temp> for the nozzle, M140/M190 S<temp> for the bed.

    The wait variant (M109, M190) wins over the plain one when both are present.
    """
    if not (match := re.match(pattern, line)):
        return False
    temperature = int(float(match.group(2)))
    if temperature <= 0:
        return True
    if match.group(1) == wait_code:
        result[key] = temperature
        return True
    result.setdefault(key, temperature)
    return True


def _read_nozzle_temperature_command(line: str, result: dict[str, Any]) -> bool:
    return _read_temperature_command(line, result, r"M(104|109)\s+S([\d.]+)", "109", "nozzle_temp")


def _read_bed_temperature_command(line: str, result: dict[str, Any]) -> bool:
    return _read_temperature_command(line, result, r"M(140|190)\s+S([\d.]+)", "190", "bed_temp")


_HEADER_LINE_READERS: tuple[Callable[[str, dict[str, Any]], bool], ...] = (
    _read_time,
    _read_layer_height,
    _read_filament_used,
    _read_slicer,
    _read_first_layer_height,
    _read_object_height,
    _read_start_print_temperatures,
    _read_nozzle_temperature_command,
    _read_bed_temperature_command,
)


def _read_header_line(line: str, result: dict[str, Any]) -> None:
    """Let the first reader that recognises the line take it."""
    for read in _HEADER_LINE_READERS:
        if read(line, result):
            return


def parse_gcode_header(gcode_bytes: bytes) -> dict[str, Any]:
    """Parse standard slicer comments from gcode header (first 64 KB).

    Handles Cura/Marlin-flavour comments like ;TIME:, ;Layer height:,
    ;Filament used:, ;Generated with, and START_PRINT temp parameters.
    """
    header = gcode_bytes[:65536].decode("ascii", errors="ignore")
    result: dict[str, Any] = {}
    for line in header.splitlines():
        _read_header_line(line.strip(), result)
    return result


_SCALAR_META_KEYS = {
    "layer_height": "layer_height",
    "first_layer_height": "first_layer_height",
    "estimated_time": "estimated_time_s",
    "first_layer_extr_temp": "nozzle_temp",
    "first_layer_bed_temp": "bed_temp",
    "slicer": "slicer",
    "slicer_version": "slicer_version",
    "layer_count": "layer_count",
    "object_height": "object_height",
}


def _map_list_or_scalar(data: dict[str, Any], key: str) -> tuple[bool, Any]:
    """Return (present, value): a list contributes its first item, an empty list nothing."""
    value = data.get(key)
    if isinstance(value, list):
        return (True, value[0]) if value else (False, None)
    return (value is not None, value)


def map_moonraker_meta(data: dict[str, Any]) -> dict[str, Any]:
    """Map Moonraker /server/files/metadata response to normalized gcode_meta fields.

    Only includes keys that are present and non-None in the response.
    filament_total is in mm — converted to grams using the same constant as prints.py.
    """
    result: dict[str, Any] = {
        target: data[source] for source, target in _SCALAR_META_KEYS.items() if data.get(source) is not None
    }

    # filament_total is in mm; filament_weight_total (g) is the pre-converted field some slicers emit
    filament_mm = data.get("filament_total") or data.get("filament_weight_total")
    if filament_mm is not None:
        result["filament_weight_g"] = round(float(filament_mm) * _MM_TO_GRAMS, 2)

    for key in ("nozzle_diameter", "filament_type"):
        present, value = _map_list_or_scalar(data, key)
        if present:
            result[key] = value
    return result


async def extract_gcode_meta(filename: str) -> dict[str, Any]:
    """Extract gcode metadata for a file.

    Priority (highest wins): custom '; meta:' comments > gcode header > Moonraker metadata.
    Returns empty dict if all sources fail.
    """
    meta: dict[str, Any] = {}

    # Moonraker metadata as baseline (lowest priority)
    try:
        moonraker_data = await moonraker.get_file_metadata(filename)
        meta.update(map_moonraker_meta(moonraker_data))
    except Exception as exc:
        log.debug("gcode_meta: moonraker metadata failed for %s: %s", filename, exc)

    # Gcode header parsing — overrides Moonraker where present
    try:
        gcode_bytes = await moonraker.download_file_partial(filename, size=65536)
        header_meta = parse_gcode_header(gcode_bytes)
        meta.update(header_meta)
        # Custom '; meta:' comments have highest priority
        custom = parse_custom_meta(gcode_bytes)
        meta.update(custom)
    except Exception as exc:
        log.debug("gcode_meta: gcode header parse failed for %s: %s", filename, exc)

    return meta
