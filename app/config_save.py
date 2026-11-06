"""What waits to be saved in the printer's config, and how it differs from what the printer runs with."""

from typing import Any

SAVE_CONFIG_SCRIPT = "SAVE_CONFIG"
CONFIGFILE_ATTRIBUTES = "save_config_pending,save_config_pending_items,settings"


def as_text(value: Any) -> str | None:
    return None if value is None else str(value)


def find_running_value(settings: dict, section: str, key: str) -> str | None:
    return as_text(settings.get(section.lower(), {}).get(key))


def describe_pending_changes(configfile: dict) -> dict:
    """The values that wait for a SAVE_CONFIG, each with the value the printer runs with now."""
    settings = configfile.get("settings", {})
    items = configfile.get("save_config_pending_items", {})
    changes = [
        {"section": section, "key": key, "old": find_running_value(settings, section, key), "new": str(value)}
        for section, values in sorted(items.items())
        for key, value in sorted(values.items())
    ]
    return {"pending": bool(configfile.get("save_config_pending")), "changes": changes}
