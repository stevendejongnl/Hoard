"""What Hoard does around the printer's power: a clean shutdown before it goes off, a restart after it comes on."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.moonraker import moonraker

log = logging.getLogger(__name__)

SHUTDOWN_PATH = "/printer/emergency_stop"
RESTART_PATH = "/printer/firmware_restart"
READY_ATTEMPTS = 45
READY_INTERVAL_SECONDS = 2.0
NEEDS_RESTART_STATES = ("shutdown", "error")
EXPECTED_FAULT_PREFIXES = ("klipper.", "board.")


def without_expected_faults(faults: list[dict[str, Any]], expected_off: bool) -> list[dict[str, Any]]:
    """A printer that Hoard switched off is not running Klipper: that is no fault."""
    if not expected_off:
        return faults
    return [fault for fault in faults if not fault["key"].startswith(EXPECTED_FAULT_PREFIXES)]


class PrinterPower:
    def __init__(
        self,
        klipper: Any = moonraker,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        attempts: int = READY_ATTEMPTS,
    ) -> None:
        self._klipper = klipper
        self._sleep = sleep
        self._attempts = attempts
        self._expected_off = False

    def is_expected_off(self) -> bool:
        return self._expected_off

    async def prepare_power_off(self) -> None:
        """Klipper is shut down on purpose, so the loss of the board that follows is not reported as a fault."""
        self._expected_off = True
        try:
            await self._klipper.post(SHUTDOWN_PATH)
        except Exception as exc:
            log.info("Klipper did not take the shutdown before the power went off: %s", exc)

    def note_power_on(self) -> None:
        self._expected_off = False

    async def wait_until_ready(self) -> bool:
        """After the power came on: restart the firmware once if Klipper is shut down, and wait until it is ready."""
        restarted = False
        for _ in range(self._attempts):
            state = await self._read_state()
            if state == "ready":
                return True
            if state in NEEDS_RESTART_STATES and not restarted:
                restarted = await self._restart_firmware()
            await self._sleep(READY_INTERVAL_SECONDS)
        return False

    async def _read_state(self) -> str | None:
        try:
            return (await self._klipper.get("/printer/info"))["state"]
        except Exception:
            return None

    async def _restart_firmware(self) -> bool:
        try:
            await self._klipper.post(RESTART_PATH)
        except Exception as exc:
            log.warning("Firmware restart after the power came on failed: %s", exc)
        return True


printer_power = PrinterPower()
