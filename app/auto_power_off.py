"""Switches the printer's power off when it has been idle for a set time."""

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

BUSY_PRINT_STATES = ("printing", "paused")
COOL_BELOW_CELSIUS = 45.0
DEFAULT_IDLE_MINUTES = 30


@dataclass(frozen=True)
class AutoPowerOffSettings:
    enabled: bool = True
    idle_minutes: int = DEFAULT_IDLE_MINUTES


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
