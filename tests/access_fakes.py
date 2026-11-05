"""A clock and a sleep that belong together: sleeping moves the clock, and a person may answer while it sleeps."""

from collections.abc import Awaitable, Callable

from app.control_access import ControlAccess


class PassingTime:
    def __init__(self, answer: Callable[[], Awaitable[None]] | None = None) -> None:
        self.now = 1000.0
        self.slept: list[float] = []
        self.answer = answer

    def clock(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds
        answer, self.answer = self.answer, None
        if answer:
            await answer()

    def access(self) -> ControlAccess:
        return ControlAccess(clock=self.clock, sleep=self.sleep)
