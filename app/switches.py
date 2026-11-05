import json
import logging
import re
from dataclasses import dataclass, replace
from typing import Any

from app.config import settings

log = logging.getLogger(__name__)

PRINTER_POWER_LABEL = "Printer power"
PRINTER_POWER_DESCRIPTION = "Powers the printer's boards: Klipper cannot connect to the MCU while it is off"


@dataclass(frozen=True)
class SwitchDefinition:
    key: str
    label: str
    entity_id: str
    # the key of the switch that must be on before this one may be switched on
    requires: str | None = None
    is_printer: bool = False
    # what the switch powers, for the person and for an assistant: for example that Klipper needs it for the MCU
    description: str = ""


@dataclass(frozen=True)
class SwitchEntry:
    """One entry of the setting, before the keys are known."""

    label: str
    entity_id: str
    requires_label: str | None = None
    is_printer: bool = False
    description: str = ""


def create_switch_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def split_label_and_entity(text: str) -> tuple[str, str] | None:
    label, separator, entity_id = text.partition("=")
    if not separator:
        return None
    label, entity_id = label.strip(), entity_id.strip()
    if not label or not entity_id:
        return None
    return label, entity_id


def create_unique_key(label: str, taken_keys: set[str]) -> str:
    base_key = create_switch_key(label)
    key, number = base_key, 2
    while key in taken_keys:
        key = f"{base_key}-{number}"
        number += 1
    return key


def parse_switch_definitions(text: str) -> list[SwitchDefinition]:
    definitions: list[SwitchDefinition] = []
    taken_keys: set[str] = set()
    for part in text.split(","):
        pair = split_label_and_entity(part)
        if pair is None or not create_switch_key(pair[0]):
            continue
        key = create_unique_key(pair[0], taken_keys)
        taken_keys.add(key)
        definitions.append(SwitchDefinition(key=key, label=pair[0], entity_id=pair[1]))
    return definitions


def read_json_entry(item: Any, printer_entity_id: str) -> SwitchEntry | None:
    if not isinstance(item, dict):
        return None
    label = str(item.get("label", "")).strip()
    is_printer = item.get("printer") is True
    entity_id = printer_entity_id if is_printer else str(item.get("entity", "")).strip()
    if not create_switch_key(label) or not entity_id:
        return None
    requires = item.get("requires")
    description = str(item.get("description", "")).strip()
    return SwitchEntry(label, entity_id, str(requires).strip() if requires else None, is_printer, description)


def read_json_entries(text: str, printer_entity_id: str) -> list[SwitchEntry]:
    try:
        items = json.loads(text)
    except json.JSONDecodeError:
        log.warning("HA_SWITCHES is not valid JSON")
        return []
    if not isinstance(items, list):
        return []
    entries = (read_json_entry(item, printer_entity_id) for item in items)
    return [entry for entry in entries if entry is not None]


def read_entries(text: str, printer_entity_id: str) -> list[SwitchEntry]:
    if text.strip().startswith("["):
        return read_json_entries(text, printer_entity_id)
    return [SwitchEntry(definition.label, definition.entity_id) for definition in parse_switch_definitions(text)]


def place_printer_power(entries: list[SwitchEntry], printer_entity_id: str) -> list[SwitchEntry]:
    if any(entry.is_printer for entry in entries):
        return entries
    printer = SwitchEntry(PRINTER_POWER_LABEL, printer_entity_id, is_printer=True)
    return [printer, *entries]


def give_keys(entries: list[SwitchEntry]) -> list[SwitchDefinition]:
    taken_keys: set[str] = set()
    definitions = []
    for entry in entries:
        key = create_unique_key(entry.label, taken_keys)
        taken_keys.add(key)
        description = entry.description or (PRINTER_POWER_DESCRIPTION if entry.is_printer else "")
        definitions.append(
            SwitchDefinition(key, entry.label, entry.entity_id, is_printer=entry.is_printer, description=description)
        )
    return definitions


def find_required_key(entry: SwitchEntry, definitions: list[SwitchDefinition]) -> str | None:
    if entry.requires_label is None:
        return None
    found = next((definition.key for definition in definitions if definition.label == entry.requires_label), None)
    if found is None:
        log.warning("Switch %s needs %s, which is not configured", entry.label, entry.requires_label)
    return found


def needs_itself(key: str, requires: dict[str, str | None]) -> bool:
    seen: set[str] = set()
    current = requires.get(key)
    while current is not None and current not in seen:
        if current == key:
            return True
        seen.add(current)
        current = requires.get(current)
    return False


def break_circles(definitions: list[SwitchDefinition]) -> list[SwitchDefinition]:
    requires = {definition.key: definition.requires for definition in definitions}
    for definition in definitions:
        if needs_itself(definition.key, requires):
            log.warning("Switch %s needs itself through other switches", definition.label)
            requires[definition.key] = None
    return [replace(definition, requires=requires[definition.key]) for definition in definitions]


def read_switch_definitions(text: str, printer_entity_id: str) -> list[SwitchDefinition]:
    """The switches in the order of the setting, the printer power among them, each with what it needs."""
    entries = place_printer_power(read_entries(text, printer_entity_id), printer_entity_id)
    definitions = give_keys(entries)
    linked = [
        replace(definition, requires=find_required_key(entry, definitions))
        for definition, entry in zip(definitions, entries, strict=True)
    ]
    return break_circles(linked)


def configured_switches() -> list[SwitchDefinition]:
    return read_switch_definitions(settings.ha_switches, settings.ha_power_switch)


def find_switch(key: str) -> SwitchDefinition | None:
    return next((definition for definition in configured_switches() if definition.key == key), None)


def find_printer_switch() -> SwitchDefinition:
    return next(definition for definition in configured_switches() if definition.is_printer)


def find_dependents(definitions: list[SwitchDefinition], key: str) -> list[SwitchDefinition]:
    """Every switch that needs this one, directly or through others, the deepest first."""
    children = [definition for definition in definitions if definition.requires == key]
    return [found for child in children for found in [*find_dependents(definitions, child.key), child]]
