import re
from dataclasses import dataclass

from app.config import settings


@dataclass(frozen=True)
class SwitchDefinition:
    key: str
    label: str
    entity_id: str


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


def configured_switches() -> list[SwitchDefinition]:
    return parse_switch_definitions(settings.ha_switches)


def find_switch(key: str) -> SwitchDefinition | None:
    return next((definition for definition in configured_switches() if definition.key == key), None)
