"""Measures how many frames a camera really sends, as opposed to the target in its settings."""

import time
from collections import deque
from collections.abc import Callable

WINDOW_SECONDS = 5.0


class FrameRateMeter:
    def __init__(self, window_seconds: float = WINDOW_SECONDS, clock: Callable[[], float] = time.monotonic) -> None:
        self._window_seconds = window_seconds
        self._clock = clock
        self._arrivals: deque[float] = deque()

    def note_frame(self) -> None:
        self._arrivals.append(self._clock())
        self._forget_old_frames()

    def frames_per_second(self) -> float | None:
        """None while there are too few frames in the window to tell, for example when the stream has stopped."""
        self._forget_old_frames()
        if len(self._arrivals) < 2:
            return None
        elapsed = self._arrivals[-1] - self._arrivals[0]
        return (len(self._arrivals) - 1) / elapsed if elapsed > 0 else None

    def _forget_old_frames(self) -> None:
        limit = self._clock() - self._window_seconds
        while self._arrivals and self._arrivals[0] < limit:
            self._arrivals.popleft()


class FrameRates:
    """One meter for each camera, by its index in the list of webcams."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._meters: dict[int, FrameRateMeter] = {}

    def note_frame(self, index: int) -> None:
        self._meters.setdefault(index, FrameRateMeter(clock=self._clock)).note_frame()

    def measured(self, index: int) -> float | None:
        meter = self._meters.get(index)
        return meter.frames_per_second() if meter else None


frame_rates = FrameRates()
