"""Sample data for the screenshots of print failure detection: a detector that has found a failed print.

The camera frames are drawn here, a bed with a print and a tangle of filament, so the screenshots need no real
photo of a room.
"""

import io
import random
from dataclasses import dataclass
from typing import Any

from PIL import Image, ImageDraw

JsonObject = dict[str, Any]

FRAME_SIZE = (640, 480)
ALERT_SCORE = 0.82
ALERTS_PATH = "/api/detection/alerts"
SETTINGS = {
    "enabled": True,
    "threshold": 0.5,
    "interval_seconds": 10,
    "window_size": 5,
    "required_frames": 3,
    "action": "notify",
}

# id, minutes ago, filename, score, box (centre x, centre y, width, height), verdict
ALERT_ROWS = [
    (5, 4, "Piedistallo+per+lego+F1+2Posti.gcode", ALERT_SCORE, (330, 300, 260, 190), None),
    (4, 2900, "helicopter-blade.gcode", 0.71, (300, 280, 220, 160), "real"),
    (3, 5800, "dactyl-manuform-dm-5x6-plate.gcode", 0.56, (360, 320, 150, 120), "false_alarm"),
    (2, 11500, "tap_cover_plate.gcode", 0.64, (280, 310, 170, 140), "false_alarm"),
    (1, 20100, "helicopter-blade.gcode", 0.93, (320, 290, 300, 210), "real"),
]
FIXED_ALERT_TIME = 1_792_000_000


@dataclass(frozen=True)
class DetectionScreen:
    path: str
    size: tuple[int, int]
    file_name: str
    steps: tuple = ()


DESKTOP_SIZE = (1440, 900)
PHONE_SIZE = (390, 844)
DETECTION_SHOWCASE_SCREENS = {
    "dashboard-alert-desktop": DetectionScreen("/", DESKTOP_SIZE, "dashboard-alert.png"),
    "detections-desktop": DetectionScreen("/detections", DESKTOP_SIZE, "detections.png"),
    "detection-settings-desktop": DetectionScreen(
        "/system", DESKTOP_SIZE, "detection-settings.png", (("click", ".system-tab:last-child"),)
    ),
    "dashboard-alert-phone": DetectionScreen("/", PHONE_SIZE, "dashboard-alert-phone.png"),
}


def draw_failed_print(seed: int) -> bytes:
    """A top-down look at a bed with a print, and a tangle of filament next to it."""
    generator = random.Random(seed)
    image = Image.new("RGB", FRAME_SIZE, (58, 62, 68))
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((70, 50, 570, 450), fill=(34, 38, 44), outline=(90, 96, 104), width=3)
    drawing.rectangle((250, 250, 420, 380), fill=(226, 232, 240))
    for _ in range(90):
        start = (generator.randint(240, 450), generator.randint(200, 400))
        end = (start[0] + generator.randint(-90, 90), start[1] + generator.randint(-70, 70))
        drawing.line((start, end), fill=(244, 114, 56), width=generator.randint(2, 4))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


def create_alert(row: tuple) -> JsonObject:
    identifier, minutes_ago, filename, score, box, verdict = row
    return {
        "id": identifier,
        "created_at": FIXED_ALERT_TIME - minutes_ago * 60,
        "filename": filename,
        "score": score,
        "detections": [{"label": "failure", "score": score, "box": list(box)}],
        "has_frame": True,
        "verdict": verdict,
        "frame_url": f"{ALERTS_PATH}/{identifier}/frame",
    }


def create_detection_responses() -> dict[str, Any]:
    alerts = [create_alert(row) for row in ALERT_ROWS]
    responses: dict[str, Any] = {
        "/api/detection": {
            "configured": True,
            "frames_leave_network": False,
            "state": "alert",
            "score": ALERT_SCORE,
            "settings": SETTINGS,
            "suggestion": None,
        },
        "/api/detection/settings": SETTINGS,
        ALERTS_PATH: alerts,
        f"{ALERTS_PATH}?verdict=unlabelled": [alert for alert in alerts if alert["verdict"] is None],
    }
    for alert in alerts:
        responses[alert["frame_url"]] = draw_failed_print(alert["id"])
    return responses


def create_detection_events() -> list[tuple[str, JsonObject]]:
    return [("detection", {"state": "alert", "score": ALERT_SCORE})]
