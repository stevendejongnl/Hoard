"""What a failed request to the printer means for the person who asked: the cause and what to do, never an address."""

import httpx

from app.moonraker_connection import PrinterUnreachableError

UNREACHABLE_TEXT = "Hoard cannot reach the printer. Is it switched on?"
TOO_SLOW_TEXT = "The printer did not answer in time. Try again in a moment."
STARTING_TEXT = "Klipper is still starting up. Try again in a moment."
UNREACHABLE_FAILURES = (PrinterUnreachableError, httpx.ConnectError, httpx.ConnectTimeout)


def read_refusal_message(response: httpx.Response) -> str:
    try:
        return str(response.json()["error"]["message"]).strip()
    except (ValueError, KeyError, TypeError):
        return ""


def explain_klipper(klipper: dict) -> str:
    state = klipper["state"]
    if state == "startup":
        return STARTING_TEXT
    reason = next(iter(klipper.get("message", "").strip().splitlines()), "")
    cause = f": {reason.rstrip('.')}." if reason else "."
    return f"Klipper is {state}{cause} Restart Klipper or run a firmware restart, then try again."


def explain_refusal(failure: httpx.HTTPStatusError) -> str:
    text = f"The printer refused the command ({failure.response.status_code})"
    message = read_refusal_message(failure.response)
    return f"{text}: {message}" if message else text


def explain_printer_error(failure: Exception, klipper: dict | None) -> tuple[int, str]:
    """The status code and the text for a failure; `klipper` is what Klipper says about itself, when known."""
    if isinstance(failure, UNREACHABLE_FAILURES):
        return 502, UNREACHABLE_TEXT
    if isinstance(failure, httpx.TimeoutException):
        return 504, TOO_SLOW_TEXT
    if isinstance(failure, httpx.HTTPStatusError):
        if klipper and klipper.get("state") not in (None, "ready"):
            return 503, explain_klipper(klipper)
        return 502, explain_refusal(failure)
    return 502, str(failure)
