"""What Hoard does around the printer's power: it hides the faults of a printer that is off, and brings Klipper back."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.moonraker import moonraker

log = logging.getLogger(__name__)

RESTART_PATH = "/printer/firmware_restart"
READY_ATTEMPTS = 45
READY_INTERVAL_SECONDS = 2.0
NEEDS_RESTART_STATES = ("shutdown", "error")
EXPECTED_FAULT_PREFIXES = ("klipper.", "board.")
POWER_CUT_GRACE_SECONDS = 60.0
SWITCH_WATCH_SECONDS = 10.0


def without_expected_faults(faults: list[dict[str, Any]], expected_off: bool) -> list[dict[str, Any]]:
    """A printer that is switched off is not running Klipper: that is no fault."""
    if not expected_off:
        return faults
    return [fault for fault in faults if not fault["key"].startswith(EXPECTED_FAULT_PREFIXES)]


class PrinterPower:
    def __init__(
        self,
        klipper: Any = moonraker,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        attempts: int = READY_ATTEMPTS,
        clock: Callable[[], float] = time.monotonic,
        grace_seconds: float = POWER_CUT_GRACE_SECONDS,
    ) -> None:
        self._klipper = klipper
        self._sleep = sleep
        self._attempts = attempts
        self._clock = clock
        self._grace_seconds = grace_seconds
        self._switch_state = "unknown"
        self._grace_until = 0.0
        self._recovery: asyncio.Task[bool] | None = None

    def is_expected_off(self) -> bool:
        return self._switch_state == "off" or self._clock() < self._grace_until

    def note_power_cut(self) -> None:
        """Hoard cuts the power: until the switch has been read again, the loss of Klipper is expected."""
        self._grace_until = self._clock() + self._grace_seconds

    def observe(self, switch_state: str) -> None:
        """The state of the printer's switch. A printer that gets power again is brought back, whoever switched it."""
        came_on = self._switch_state == "off" and switch_state == "on"
        self._switch_state = switch_state
        if came_on:
            self._recovery = asyncio.create_task(self.wait_until_ready())

    async def wait_until_ready(self) -> bool:
        """Restart the firmware once if Klipper is shut down, and wait until it is ready."""
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


async def watch_printer_power(
    read_switch_state: Callable[[], Awaitable[str]],
    power: PrinterPower,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    interval: float = SWITCH_WATCH_SECONDS,
) -> None:
    """Runs all the time: tells the power what the printer's switch says."""
    while True:
        try:
            power.observe(await read_switch_state())
        except Exception as exc:
            log.warning("Printer switch read error: %s", exc)
            power.observe("unknown")
        await sleep(interval)


printer_power = PrinterPower()
