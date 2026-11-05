"""Builds the auto power-off from the settings of the app: what it reads, and the one switch it cuts."""

import time
from collections.abc import Callable
from typing import Any

import httpx

from app.auto_power_off import AutoPowerOff, AutoPowerOffSettings, build_auto_power_off_settings, read_printer_activity
from app.config import settings
from app.db import default_database
from app.moonraker import moonraker
from app.printer_power import printer_power
from app.server_sent_events import hub
from app.switches import read_switch_definitions

HA_TIMEOUT_SECONDS = 10


def build_auto_power_off(
    database: Any = default_database,
    event_hub: Any = hub,
    klipper: Any = moonraker,
    power: Any = printer_power,
    app_settings: Any = settings,
    http_client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
    clock: Callable[[], float] = time.time,
) -> AutoPowerOff:
    async def read_activity():
        return await read_printer_activity(
            klipper, lambda: event_hub.last_value("printer_state"), lambda: event_hub.last_value("power")
        )

    async def load_settings() -> AutoPowerOffSettings:
        return build_auto_power_off_settings(await database.get_auto_power_off_settings())

    async def power_off() -> None:
        """Only the printer's own switch: what it needs, such as the Pi, stays on."""
        definitions = read_switch_definitions(app_settings.ha_switches, app_settings.ha_power_switch)
        printer = next(definition for definition in definitions if definition.is_printer)
        power.note_power_cut()
        async with http_client_factory() as client:
            response = await client.post(
                f"{app_settings.ha_url}/api/services/homeassistant/turn_off",
                headers={"Authorization": f"Bearer {app_settings.ha_token}"},
                json={"entity_id": printer.entity_id},
                timeout=HA_TIMEOUT_SECONDS,
            )
            response.raise_for_status()

    return AutoPowerOff(read_activity, load_settings, power_off, clock)


auto_power_off = build_auto_power_off()
