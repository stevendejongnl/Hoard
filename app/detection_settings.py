"""The values of print failure detection that the owner can change while Hoard runs."""

from dataclasses import dataclass, fields
from typing import Any

ACTIONS = ("notify", "pause")


class InvalidDetectionSettingsError(ValueError):
    """A value that makes no sense, for example a threshold above 1."""


@dataclass(frozen=True)
class DetectionSettings:
    enabled: bool = True
    threshold: float = 0.5
    interval_seconds: int = 10
    window_size: int = 5
    required_frames: int = 3
    action: str = "notify"


def _check(settings: DetectionSettings) -> None:
    if not 0 <= settings.threshold <= 1:
        raise InvalidDetectionSettingsError("The threshold is between 0 and 1")
    if settings.interval_seconds < 1:
        raise InvalidDetectionSettingsError("The interval is at least 1 second")
    if settings.window_size < 1 or settings.required_frames < 1:
        raise InvalidDetectionSettingsError("The window and the frames needed are at least 1")
    if settings.required_frames > settings.window_size:
        raise InvalidDetectionSettingsError("The frames needed cannot be more than the window")
    if settings.action not in ACTIONS:
        raise InvalidDetectionSettingsError(f"The action is one of {', '.join(ACTIONS)}")


def build_detection_settings(values: dict[str, Any]) -> DetectionSettings:
    """The defaults with the given values on top. Values that are not settings are ignored."""
    known = {field.name for field in fields(DetectionSettings)}
    settings = DetectionSettings(**{key: value for key, value in values.items() if key in known})
    _check(settings)
    return settings
