import asyncio
from collections.abc import Callable

import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.moonraker import MoonrakerClient
from app.routes.dependencies import HomeAssistant, HttpClientFactory, Moonraker
from app.switches import SwitchDefinition, configured_switches, find_switch

router = APIRouter(prefix="/api/control", tags=["control"])

CreateClient = Callable[[], httpx.AsyncClient]


def _ha_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.ha_token}"}


async def _ha_service(
    domain: str, service: str, entity_id: str, create_client: CreateClient = httpx.AsyncClient
) -> None:
    async with create_client() as client:
        r = await client.post(
            f"{settings.ha_url}/api/services/{domain}/{service}",
            headers=_ha_headers(),
            json={"entity_id": entity_id},
            timeout=10,
        )
        r.raise_for_status()


async def _get_switch_state(create_client: CreateClient = httpx.AsyncClient) -> str:
    async with create_client() as client:
        r = await client.get(
            f"{settings.ha_url}/api/states/{settings.ha_power_switch}",
            headers=_ha_headers(),
            timeout=10,
        )
        r.raise_for_status()
        return r.json()["state"]  # "on" or "off"


async def read_switch_state(home_assistant: HomeAssistant, entity_id: str) -> str:
    try:
        return (await home_assistant.get_state(entity_id))["state"]
    except Exception:
        return "unknown"


def describe_switch(definition: SwitchDefinition, state: str) -> dict:
    return {"key": definition.key, "label": definition.label, "entity_id": definition.entity_id, "state": state}


@router.get("/switches")
async def list_switches(home_assistant: HomeAssistant) -> list[dict]:
    definitions = configured_switches()
    states = await asyncio.gather(
        *(read_switch_state(home_assistant, definition.entity_id) for definition in definitions)
    )
    return [describe_switch(definition, state) for definition, state in zip(definitions, states, strict=True)]


async def switch_to(create_client: CreateClient, key: str, service: str, state: str) -> dict:
    definition = find_switch(key)
    if definition is None:
        raise HTTPException(404, "Switch not found")
    try:
        await _ha_service("homeassistant", service, definition.entity_id, create_client)
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"state": state}


@router.post("/switches/{key}/on")
async def switch_on(key: str, create_client: HttpClientFactory) -> dict:
    return await switch_to(create_client, key, "turn_on", "on")


@router.post("/switches/{key}/off")
async def switch_off(key: str, create_client: HttpClientFactory) -> dict:
    return await switch_to(create_client, key, "turn_off", "off")


@router.get("/power")
async def power_state(create_client: HttpClientFactory) -> dict:
    try:
        return {"state": await _get_switch_state(create_client)}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


async def _switch_power(create_client: CreateClient, service: str, state: str) -> dict:
    try:
        await _ha_service("switch", service, settings.ha_power_switch, create_client)
        return {"state": state}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/power/on")
async def power_on(create_client: HttpClientFactory) -> dict:
    return await _switch_power(create_client, "turn_on", "on")


@router.post("/power/off")
async def power_off(create_client: HttpClientFactory) -> dict:
    return await _switch_power(create_client, "turn_off", "off")


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
