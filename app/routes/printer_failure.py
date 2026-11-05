import httpx
from fastapi import HTTPException

from app.moonraker import MoonrakerClient
from app.printer_errors import explain_printer_error


async def read_klipper_state(moonraker: MoonrakerClient) -> dict | None:
    """What Klipper says about itself, or None when that cannot be read."""
    try:
        info = await moonraker.get("/printer/info")
        return {"state": info["state"], "message": info.get("state_message", "")}
    except Exception:
        return None


async def explain_failure(moonraker: MoonrakerClient, failure: Exception) -> HTTPException:
    """The error to raise for a failed request to the printer. Klipper is asked only when the printer refused."""
    klipper = await read_klipper_state(moonraker) if isinstance(failure, httpx.HTTPStatusError) else None
    status_code, text = explain_printer_error(failure, klipper)
    return HTTPException(status_code, text)
