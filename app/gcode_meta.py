import logging
import math
import re
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


def parse_gcode_header(gcode_bytes: bytes) -> dict[str, Any]:
    """Parse standard slicer comments from gcode header (first 64 KB).

    Handles Cura/Marlin-flavour comments like ;TIME:, ;Layer height:,
    ;Filament used:, ;Generated with, and START_PRINT temp parameters.
    """
    header = gcode_bytes[:65536].decode("ascii", errors="ignore")
    result: dict[str, Any] = {}

    for line in header.splitlines():
        line = line.strip()

        # ;TIME:12890
        if m := re.match(r";TIME:(\d+)", line):
            result.setdefault("estimated_time_s", int(m.group(1)))

        # ;Layer height: 0.2
        elif m := re.match(r";Layer height:\s*([\d.]+)", line, re.IGNORECASE):
            result.setdefault("layer_height", float(m.group(1)))

        # ;Filament used: 12.2151m  (meters → grams)
        elif m := re.match(r";Filament used:\s*([\d.]+)m", line, re.IGNORECASE):
            mm = float(m.group(1)) * 1000
            result.setdefault("filament_weight_g", round(mm * _MM_TO_GRAMS, 2))

        # ;Generated with Cura_SteamEngine 5.12.0
        elif m := re.match(r";Generated with (\S+)\s+([\d.]+)", line, re.IGNORECASE):
            result.setdefault("slicer", m.group(1))
            result.setdefault("slicer_version", m.group(2))

        # ;MINZ:0.3  → first layer height
        elif m := re.match(r";MINZ:([\d.]+)", line):
            val = float(m.group(1))
            if val > 0:
                result.setdefault("first_layer_height", val)

        # ;MAXZ:82.6  → object height
        elif m := re.match(r";MAXZ:([\d.]+)", line):
            result.setdefault("object_height", float(m.group(1)))

        # START_PRINT BED_TEMP=60 EXTRUDER_TEMP=205
        elif line.upper().startswith("START_PRINT"):
            if bt := re.search(r"BED_TEMP=([\d.]+)", line, re.IGNORECASE):
                result.setdefault("bed_temp", int(float(bt.group(1))))
            if et := re.search(r"EXTRUDER_TEMP=([\d.]+)", line, re.IGNORECASE):
                result.setdefault("nozzle_temp", int(float(et.group(1))))

        # Older Cura (pre-START_PRINT): M104/M109 S<temp> for nozzle, M140/M190 S<temp> for bed
        # M109/M190 are the "wait" variants — prefer them over M104/M140 if both present
        elif m := re.match(r"M(104|109)\s+S([\d.]+)", line):
            temp = int(float(m.group(2)))
            if temp > 0:
                if m.group(1) == "109":
                    result["nozzle_temp"] = temp
                else:
                    result.setdefault("nozzle_temp", temp)

        elif m := re.match(r"M(140|190)\s+S([\d.]+)", line):
            temp = int(float(m.group(2)))
            if temp > 0:
                if m.group(1) == "190":
                    result["bed_temp"] = temp
                else:
                    result.setdefault("bed_temp", temp)

    return result


def map_moonraker_meta(data: dict[str, Any]) -> dict[str, Any]:
    """Map Moonraker /server/files/metadata response to normalized gcode_meta fields.

    Only includes keys that are present and non-None in the response.
    filament_total is in mm — converted to grams using the same constant as prints.py.
    """
    result: dict[str, Any] = {}

    scalar_map = {
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
    for src, dst in scalar_map.items():
        val = data.get(src)
        if val is not None:
            result[dst] = val

    # filament_total is in mm; filament_weight_total (g) is the pre-converted field some slicers emit
    filament_mm = data.get("filament_total") or data.get("filament_weight_total")
    if filament_mm is not None:
        result["filament_weight_g"] = round(float(filament_mm) * _MM_TO_GRAMS, 2)

    for src, dst in [("nozzle_diameter", "nozzle_diameter"), ("filament_type", "filament_type")]:
        val = data.get(src)
        if isinstance(val, list):
            if val:
                result[dst] = val[0]
        elif val is not None:
            result[dst] = val

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
