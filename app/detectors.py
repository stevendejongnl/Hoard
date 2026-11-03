"""What every print failure detector has in common, so a detector can be swapped for another."""

from dataclasses import dataclass
from typing import Protocol

Box = tuple[float, float, float, float]


class DetectorUnavailableError(Exception):
    """The detector could not judge the frame: it is down, it refused, or it gave no usable answer."""


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
