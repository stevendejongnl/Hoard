import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.moonraker import moonraker

router = APIRouter(prefix="/api/control", tags=["control"])


def _ha_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.ha_token}"}


async def _ha_service(domain: str, service: str, entity_id: str) -> None:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{settings.ha_url}/api/services/{domain}/{service}",
            headers=_ha_headers(),
            json={"entity_id": entity_id},
            timeout=10,
        )
        r.raise_for_status()


async def _get_switch_state() -> str:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{settings.ha_url}/api/states/{settings.ha_power_switch}",
            headers=_ha_headers(),
            timeout=10,
        )
        r.raise_for_status()
        return r.json()["state"]  # "on" or "off"


@router.get("/power")
async def power_state() -> dict:
    try:
        state = await _get_switch_state()
        return {"state": state}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/power/on")
async def power_on() -> dict:
    try:
        await _ha_service("switch", "turn_on", settings.ha_power_switch)
        return {"state": "on"}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/power/off")
async def power_off() -> dict:
    try:
        await _ha_service("switch", "turn_off", settings.ha_power_switch)
        return {"state": "off"}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/firmware_restart")
async def firmware_restart() -> dict:
    try:
        await moonraker.post("/printer/firmware_restart")
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/emergency_stop")
async def emergency_stop() -> dict:
    try:
        await moonraker.post("/printer/emergency_stop")
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/pause")
async def pause_print() -> dict:
    try:
        await moonraker.post("/printer/print/pause")
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/resume")
async def resume_print() -> dict:
    try:
        await moonraker.post("/printer/print/resume")
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/cancel")
async def cancel_print() -> dict:
    try:
        await moonraker.post("/printer/print/cancel")
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/print")
async def start_print(filename: str) -> dict:
    try:
        await moonraker.post("/printer/print/start", filename=filename)
        return {"ok": True, "filename": filename}
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
