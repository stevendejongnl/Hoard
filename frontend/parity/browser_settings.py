"""Browser conditions shared by the reference renderer and the comparison run.

Both must see the same clock, locale, timezone and motion, or identical screens would still differ.
"""

from datetime import datetime

DESKTOP_SIZE = (1360, 860)
PHONE_SIZE = (390, 844)

LOCALE = "en-GB"
TIMEZONE = "UTC"
COLOR_SCHEME = "dark"

# The dashboard shows "finish at 18:23" for a print with 3h27m left, so the clock is fixed at 14:56.
FIXED_TIME = datetime(2026, 10, 27, 14, 56, 0)

FREEZE_MOTION_STYLE = (
    "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }"
)

CONTEXT_OPTIONS = {
    "device_scale_factor": 1,
    "locale": LOCALE,
    "timezone_id": TIMEZONE,
    "color_scheme": COLOR_SCHEME,
}
