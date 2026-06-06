import logging
import re
from typing import Any

from app.moonraker import moonraker

log = logging.getLogger(__name__)


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


def map_moonraker_meta(data: dict[str, Any]) -> dict[str, Any]:
    """Map Moonraker /server/files/metadata response to normalized gcode_meta fields.

    Only includes keys that are present and non-None in the response.
    """
    result: dict[str, Any] = {}

    scalar_map = {
        "layer_height": "layer_height",
        "first_layer_height": "first_layer_height",
        "filament_weight_total": "filament_weight_g",
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

    Merges Moonraker's parsed metadata with any '; meta:key=value' custom comments.
    Returns empty dict if both sources fail.
    """
    meta: dict[str, Any] = {}

    try:
        moonraker_data = await moonraker.get_file_metadata(filename)
        meta.update(map_moonraker_meta(moonraker_data))
    except Exception as exc:
        log.debug("gcode_meta: moonraker metadata failed for %s: %s", filename, exc)

    try:
        gcode_bytes = await moonraker.download_file_partial(filename, size=65536)
        custom = parse_custom_meta(gcode_bytes)
        meta.update(custom)
    except Exception as exc:
        log.debug("gcode_meta: custom comment parse failed for %s: %s", filename, exc)

    return meta
