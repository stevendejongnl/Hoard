"""Switches the printer's power off when it has been idle for a set time."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field, fields
from typing import Any

log = logging.getLogger(__name__)

BUSY_PRINT_STATES = ("printing", "paused")
COOL_BELOW_CELSIUS = 45.0
DEFAULT_IDLE_MINUTES = 30
MAX_IDLE_MINUTES = 24 * 60
CHECK_SECONDS = 30.0
HEATERS = ("extruder", "heater_bed")


class InvalidAutoPowerOffSettingsError(ValueError):
    """An idle time that makes no sense."""


@dataclass(frozen=True)
class AutoPowerOffSettings:
    enabled: bool = True
    idle_minutes: int = DEFAULT_IDLE_MINUTES


def build_auto_power_off_settings(values: dict[str, Any]) -> AutoPowerOffSettings:
    """The defaults with the given values on top. Values that are not settings are ignored."""
    known = {field.name for field in fields(AutoPowerOffSettings)}
    settings = AutoPowerOffSettings(**{key: value for key, value in values.items() if key in known})
    if not 1 <= settings.idle_minutes <= MAX_IDLE_MINUTES:
        raise InvalidAutoPowerOffSettingsError("The idle time is between 1 minute and 24 hours")
    return settings


@dataclass(frozen=True)
class PrinterActivity:
    print_state: str
    heater_temperatures: list[float] = field(default_factory=list)
    switch_on: bool = True


@dataclass(frozen=True)
class AutoPowerOffStatus:
    enabled: bool
    off_at: float | None


def is_busy(activity: PrinterActivity) -> bool:
    if activity.print_state in BUSY_PRINT_STATES:
        return True
    return any(temperature >= COOL_BELOW_CELSIUS for temperature in activity.heater_temperatures)


class AutoPowerOff:
    def __init__(
        self,
        read_activity: Callable[[], Awaitable[PrinterActivity]],
        load_settings: Callable[[], Awaitable[AutoPowerOffSettings]],
        power_off: Callable[[], Awaitable[None]],
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._read_activity = read_activity
        self._load_settings = load_settings
        self._power_off = power_off
        self._clock = clock
        self._idle_since: float | None = None
        self._postponed_until = 0.0
        self._canceled = False
        self._off_at: float | None = None
        self._enabled = True

    async def check(self) -> None:
        activity, settings = await self._read_activity(), await self._load_settings()
        self._enabled = settings.enabled
        if is_busy(activity):
            self._canceled = False
        if not self._is_waiting(activity, settings):
            self._idle_since, self._off_at = None, None
            return
        now = self._clock()
        if self._idle_since is None:
            self._idle_since = now
        self._off_at = max(self._idle_since + settings.idle_minutes * 60, self._postponed_until)
        if now >= self._off_at:
            self._idle_since, self._off_at = None, None
            await self._power_off()

    def _is_waiting(self, activity: PrinterActivity, settings: AutoPowerOffSettings) -> bool:
        return settings.enabled and activity.switch_on and not is_busy(activity) and not self._canceled

    def postpone(self, seconds: float) -> None:
        self._postponed_until = self._clock() + seconds
        self._canceled = False

    def cancel(self) -> None:
        self._canceled = True
        self._off_at = None

    def status(self) -> AutoPowerOffStatus:
        return AutoPowerOffStatus(enabled=self._enabled, off_at=self._off_at)


async def read_printer_activity(
    klipper: Any,
    read_printer_state: Callable[[], dict[str, Any]],
    read_power: Callable[[], dict[str, Any]],
) -> PrinterActivity:
    """What the printer is doing now. A printer that does not answer has no heater readings."""
    try:
        status = (await klipper.get("/printer/objects/query", extruder="", heater_bed="")).get("status", {})
        temperatures = [status[heater]["temperature"] for heater in HEATERS if "temperature" in status.get(heater, {})]
    except Exception:
        temperatures = []
    return PrinterActivity(
        print_state=read_printer_state().get("state", "standby"),
        heater_temperatures=temperatures,
        switch_on=read_power().get("switch") == "on",
    )


async def watch_auto_power_off(
    auto_power_off: Any,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    interval: float = CHECK_SECONDS,
) -> None:
    """Runs all the time, so a printer that has been idle long enough is switched off."""
    while True:
        try:
            await auto_power_off.check()
        except Exception as exc:
            log.warning("Auto power-off error: %s", exc)
        await sleep(interval)
