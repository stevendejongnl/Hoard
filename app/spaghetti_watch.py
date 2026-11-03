"""Watches the camera during a print and tells when the print looks failed."""

from collections import deque


class FailureWindow:
    """The scores of the newest frames. One bad frame is noise; enough bad frames in a row of them is a failure."""

    def __init__(self, size: int, required: int, threshold: float) -> None:
        self._scores: deque[float] = deque(maxlen=size)
        self._required = required
        self._threshold = threshold

    def record(self, score: float) -> None:
        self._scores.append(score)

    def clear(self) -> None:
        self._scores.clear()

    def is_failing(self) -> bool:
        failed_frames = [score for score in self._scores if score >= self._threshold]
        return len(failed_frames) >= self._required
