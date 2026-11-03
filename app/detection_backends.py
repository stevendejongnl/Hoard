"""Which detector Hoard asks, from the settings: Obico's ml_api, a vision model, or the first and then the second."""

from collections.abc import Callable
from typing import Any

from app.chained_detector import ChainedDetector
from app.detectors import Detector
from app.obico_detector import ObicoDetector
from app.vision_detector import VisionDetector

FRAME_SENDING_BACKENDS = ("vision", "chained")


def is_detection_configured(app_settings: Any) -> bool:
    """Whether the backend that was chosen has what it needs. Without it, nothing about detection shows or runs."""
    has_detector = bool(app_settings.detector_url)
    has_key = bool(app_settings.vision_api_key)
    return {"obico": has_detector, "vision": has_key, "chained": has_detector and has_key}.get(
        app_settings.detector_backend, False
    )


def sends_frames_away(app_settings: Any) -> bool:
    """A vision model is a service outside the network: the camera image goes to it."""
    return app_settings.detector_backend in FRAME_SENDING_BACKENDS


def build_detector(app_settings: Any, http_client_factory: Callable[[], Any]) -> Detector | None:
    if not is_detection_configured(app_settings):
        return None
    obico = ObicoDetector(app_settings.detector_url, app_settings.detector_token, http_client_factory)
    vision = VisionDetector(
        app_settings.vision_api_key, app_settings.vision_model, app_settings.vision_base_url, http_client_factory
    )
    if app_settings.detector_backend == "vision":
        return vision
    if app_settings.detector_backend == "chained":
        return ChainedDetector(obico, vision, app_settings.chained_low, app_settings.chained_high)
    return obico
