"""What every print failure detector has in common, so a detector can be swapped for another."""

from dataclasses import dataclass
from typing import Protocol

import httpx

Box = tuple[float, float, float, float]


class DetectorUnavailableError(Exception):
    """The detector could not judge the frame: it is down, it refused, or it gave no usable answer."""


def describe_failure(failure: Exception) -> str:
    """The kind of failure, its text if it has any, and what to check. A timeout has no text of its own."""
    description = f"{type(failure).__name__}: {failure}" if str(failure) else type(failure).__name__
    if isinstance(failure, httpx.TimeoutException):
        return f"{description} - the detector did not answer in time, it may be busy or the timeout too short"
    if isinstance(failure, httpx.ConnectError):
        return f"{description} - check the detector address and that the detector is running"
    return description


@dataclass(frozen=True)
class Detection:
    label: str
    score: float
    box: Box | None


class Detector(Protocol):
    async def detect(self, snapshot_url: str) -> list[Detection]:
        """Judges the camera image at the address. Raises DetectorUnavailableError when it cannot."""
        ...


def highest_score(detections: list[Detection]) -> float:
    return max((detection.score for detection in detections), default=0.0)
