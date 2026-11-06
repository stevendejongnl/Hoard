"""The offset between the probe and the nozzle, as the printer's config holds it."""

PROBE_SECTIONS = ("bltouch", "probe")


def find_probe_offset(settings: dict) -> dict:
    """The z_offset of the probe the printer has. It is not the temporary G-code offset of a babystep."""
    for section in PROBE_SECTIONS:
        if section in settings:
            value = settings[section].get("z_offset")
            return {"section": section, "z_offset": None if value is None else str(value)}
    return {"section": None, "z_offset": None}
