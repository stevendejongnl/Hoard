import asyncio
from collections.abc import Callable

import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.moonraker import MoonrakerClient
from app.routes.dependencies import HomeAssistant, HttpClientFactory, Moonraker
from app.switches import SwitchDefinition, configured_switches, find_dependents, find_printer_switch, find_switch

router = APIRouter(prefix="/api/control", tags=["control"])

CreateClient = Callable[..., httpx.AsyncClient]


def _ha_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.ha_token}"}


async def _ha_service(
    domain: str, service: str, entity_id: str, create_client: CreateClient = httpx.AsyncClient
) -> None:
    async with create_client() as client:
        response = await client.post(
            f"{settings.ha_url}/api/services/{domain}/{service}",
            headers=_ha_headers(),
            json={"entity_id": entity_id},
            timeout=10,
        )
        response.raise_for_status()


async def _get_switch_state(create_client: CreateClient = httpx.AsyncClient) -> str:
    async with create_client() as client:
        response = await client.get(
            f"{settings.ha_url}/api/states/{settings.ha_power_switch}",
            headers=_ha_headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()["state"]  # "on" or "off"


async def read_switch_state(home_assistant: HomeAssistant, entity_id: str) -> str:
    try:
        return (await home_assistant.get_state(entity_id))["state"]
    except Exception:
        return "unknown"


def describe_switch(definition: SwitchDefinition, state: str) -> dict:
    return {
        "key": definition.key,
        "label": definition.label,
        "entity_id": definition.entity_id,
        "state": state,
        "requires": definition.requires,
        "is_printer": definition.is_printer,
    }


@router.get("/switches")
async def list_switches(home_assistant: HomeAssistant) -> list[dict]:
    definitions = configured_switches()
    states = await asyncio.gather(
        *(read_switch_state(home_assistant, definition.entity_id) for definition in definitions)
    )
    return [describe_switch(definition, state) for definition, state in zip(definitions, states, strict=True)]


def find_switch_or_404(key: str) -> SwitchDefinition:
    definition = find_switch(key)
    if definition is None:
        raise HTTPException(404, "Switch not found")
    return definition


async def refuse_without_required_switch(definition: SwitchDefinition, home_assistant: HomeAssistant) -> None:
    required = find_switch(definition.requires) if definition.requires else None
    if required is None:
        return
    if await read_switch_state(home_assistant, required.entity_id) != "on":
        raise HTTPException(409, f"Needs {required.label}")


async def call_switch_service(create_client: CreateClient, definition: SwitchDefinition, service: str) -> None:
    try:
        await _ha_service("homeassistant", service, definition.entity_id, create_client)
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


async def turn_switch_on(
    definition: SwitchDefinition, create_client: CreateClient, home_assistant: HomeAssistant
) -> dict:
    await refuse_without_required_switch(definition, home_assistant)
    await call_switch_service(create_client, definition, "turn_on")
    return {"state": "on"}


async def find_dependents_that_are_on(
    definition: SwitchDefinition, home_assistant: HomeAssistant
) -> list[SwitchDefinition]:
    dependents = find_dependents(configured_switches(), definition.key)
    states = await asyncio.gather(*(read_switch_state(home_assistant, item.entity_id) for item in dependents))
    return [item for item, state in zip(dependents, states, strict=True) if state == "on"]


async def turn_switch_off(
    definition: SwitchDefinition, create_client: CreateClient, home_assistant: HomeAssistant
) -> dict:
    """What needs this switch goes off first; one that does not stops the switch from going off."""
    dependents = await find_dependents_that_are_on(definition, home_assistant)
    for dependent in dependents:
        await call_switch_service(create_client, dependent, "turn_off")
    await call_switch_service(create_client, definition, "turn_off")
    return {"state": "off", "also_off": [dependent.key for dependent in dependents]}


@router.post("/switches/{key}/on")
async def switch_on(key: str, create_client: HttpClientFactory, home_assistant: HomeAssistant) -> dict:
    return await turn_switch_on(find_switch_or_404(key), create_client, home_assistant)


@router.post("/switches/{key}/off")
async def switch_off(key: str, create_client: HttpClientFactory, home_assistant: HomeAssistant) -> dict:
    return await turn_switch_off(find_switch_or_404(key), create_client, home_assistant)


@router.get("/power")
async def power_state(create_client: HttpClientFactory) -> dict:
    try:
        return {"state": await _get_switch_state(create_client)}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/power/on")
async def power_on(create_client: HttpClientFactory, home_assistant: HomeAssistant) -> dict:
    return await turn_switch_on(find_printer_switch(), create_client, home_assistant)


@router.post("/power/off")
async def power_off(create_client: HttpClientFactory, home_assistant: HomeAssistant) -> dict:
    return await turn_switch_off(find_printer_switch(), create_client, home_assistant)


async def _command_printer(moonraker: MoonrakerClient, path: str, answer: dict | None = None, **data: str) -> dict:
    """Post a command to Moonraker; a printer that refuses is a 502."""
    try:
        await moonraker.post(path, **data)
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return answer if answer is not None else {"ok": True}


@router.post("/firmware_restart")
async def firmware_restart(moonraker: Moonraker) -> dict:
    return await _command_printer(moonraker, "/printer/firmware_restart")


@router.post("/emergency_stop")
async def emergency_stop(moonraker: Moonraker) -> dict:
    return await _command_printer(moonraker, "/printer/emergency_stop")


@router.post("/pause")
async def pause_print(moonraker: Moonraker) -> dict:
    return await _command_printer(moonraker, "/printer/print/pause")


@router.post("/resume")
async def resume_print(moonraker: Moonraker) -> dict:
    return await _command_printer(moonraker, "/printer/print/resume")


@router.post("/cancel")
async def cancel_print(moonraker: Moonraker) -> dict:
    return await _command_printer(moonraker, "/printer/print/cancel")


@router.post("/print")
async def start_print(filename: str, moonraker: Moonraker) -> dict:
    return await _command_printer(
        moonraker, "/printer/print/start", {"ok": True, "filename": filename}, filename=filename
    )
