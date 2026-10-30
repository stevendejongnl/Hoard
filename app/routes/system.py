import asyncio
from typing import Any

from fastapi import APIRouter

from app.routes.dependencies import Moonraker
from app.system_snapshot import build_sections, is_shown_object

router = APIRouter(prefix="/api/system", tags=["system"])

HOST_READINGS = {
    "system_info": ("/machine/system_info", "system_info"),
    "proc_stats": ("/machine/proc_stats", None),
    "server_info": ("/server/info", None),
    "printer_info": ("/printer/info", None),
}


async def _read(moonraker: Any, path: str, inner_key: str | None = None, **params: Any) -> dict[str, Any] | None:
    """One answer of the printer's host, or None: a part that fails must not hide the other parts."""
    try:
        answer = await moonraker.get(path, **params)
    except Exception:
        return None
    return answer.get(inner_key, {}) if inner_key else answer


async def _read_objects(moonraker: Any) -> dict[str, Any]:
    listing = await _read(moonraker, "/printer/objects/list")
    names = [name for name in (listing or {}).get("objects", []) if is_shown_object(name)]
    if not names:
        return {}
    answer = await _read(moonraker, "/printer/objects/query", **dict.fromkeys(names, ""))
    return (answer or {}).get("status", {})


async def read_host(moonraker: Any) -> dict[str, Any]:
    """What the host reports; the key "reachable" says whether anything answered at all."""
    keys = list(HOST_READINGS)
    answers = await asyncio.gather(*(_read(moonraker, *HOST_READINGS[key]) for key in keys))
    readings: dict[str, Any] = {key: answer for key, answer in zip(keys, answers, strict=True) if answer is not None}
    reachable = bool(readings)
    readings["objects"] = await _read_objects(moonraker) if reachable else {}
    readings["reachable"] = reachable
    return readings


@router.get("")
async def get_system(moonraker: Moonraker) -> dict[str, Any]:
    readings = await read_host(moonraker)
    return {"reachable": readings["reachable"], "sections": build_sections(readings)}
