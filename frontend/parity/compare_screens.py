"""Compare every screen of the app with its reference image from the design.

Starts the mock backend and the app's development server, opens each screen at the design size,
saves a screenshot and a difference image, and prints how far each screen is from the design.
The exit code is 1 when any screen is outside the tolerance, so this is the test for pixel parity.

Usage (from the repository root):
    python3 -m frontend.parity.compare_screens [--only dashboard-desktop history-phone]
"""

import argparse
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image
from playwright.sync_api import Page, sync_playwright

from frontend.parity.browser_settings import (
    CONTEXT_OPTIONS,
    DESKTOP_SIZE,
    FIXED_TIME,
    FREEZE_MOTION_STYLE,
    PHONE_SIZE,
)
from frontend.parity.fixture_data import create_fixture_events, create_fixture_responses
from frontend.parity.image_comparison import (
    DEFAULT_CHANNEL_TOLERANCE,
    MAXIMUM_DIFFERENCE_SHARE,
    calculate_difference_share,
    create_difference_image,
    is_within_tolerance,
)
from frontend.parity.mock_backend import start_mock_backend

PARITY_DIRECTORY = Path(__file__).resolve().parent
FRONTEND_DIRECTORY = PARITY_DIRECTORY.parent
REFERENCE_DIRECTORY = PARITY_DIRECTORY / "references"
OUTPUT_DIRECTORY = PARITY_DIRECTORY / "output"

BACKEND_PORT = 8766  # the development server proxies /api and /stream here (see vite.config.ts)
APP_PORT = 5199
SERVER_START_TIMEOUT_SECONDS = 60
SETTLE_MILLISECONDS = 1500

# screen name -> (path, viewport size)
SCREENS = {
    "dashboard-desktop": ("/", DESKTOP_SIZE),
    "history-desktop": ("/history", DESKTOP_SIZE),
    "projects-desktop": ("/projects", DESKTOP_SIZE),
    "project-detail-desktop": ("/projects/1", DESKTOP_SIZE),
    "spools-desktop": ("/spools", DESKTOP_SIZE),
    "dashboard-phone": ("/", PHONE_SIZE),
    "history-phone": ("/history", PHONE_SIZE),
    "projects-phone": ("/projects", PHONE_SIZE),
    "project-detail-phone": ("/projects/1", PHONE_SIZE),
    "spools-phone": ("/spools", PHONE_SIZE),
}


def is_responding(address: str) -> bool:
    try:
        urllib.request.urlopen(address, timeout=1)
    except urllib.error.HTTPError:
        return True
    except OSError:
        return False
    return True


def wait_until_responding(address: str) -> None:
    deadline = time.monotonic() + SERVER_START_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if is_responding(address):
            return
        time.sleep(0.5)
    raise TimeoutError(f"{address} did not respond within {SERVER_START_TIMEOUT_SECONDS} seconds")


def start_app_server() -> subprocess.Popen:
    command = ["npx", "vite", "--host", "127.0.0.1", "--port", str(APP_PORT), "--strictPort"]
    return subprocess.Popen(command, cwd=FRONTEND_DIRECTORY, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def capture_screen(page: Page, address: str, size: tuple[int, int], target: Path) -> None:
    page.set_viewport_size({"width": size[0], "height": size[1]})
    page.goto(address, wait_until="load")
    page.add_style_tag(content=FREEZE_MOTION_STYLE)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(SETTLE_MILLISECONDS)
    page.screenshot(path=str(target), clip={"x": 0, "y": 0, "width": size[0], "height": size[1]})


def measure_difference_share(reference_path: Path, screenshot_path: Path, difference_path: Path) -> float:
    reference = Image.open(reference_path)
    screenshot = Image.open(screenshot_path)
    if reference.size != screenshot.size:
        return 1.0
    create_difference_image(reference, screenshot, DEFAULT_CHANNEL_TOLERANCE).save(difference_path)
    return calculate_difference_share(reference, screenshot, DEFAULT_CHANNEL_TOLERANCE)


def compare_screen(page: Page, name: str, app_address: str) -> float:
    path, size = SCREENS[name]
    screenshot_path = OUTPUT_DIRECTORY / f"{name}.png"
    capture_screen(page, f"{app_address}{path}", size, screenshot_path)
    return measure_difference_share(REFERENCE_DIRECTORY / f"{name}.png", screenshot_path, OUTPUT_DIRECTORY / f"{name}-difference.png")


def format_report_line(name: str, difference_share: float) -> str:
    verdict = "pass" if is_within_tolerance(difference_share, MAXIMUM_DIFFERENCE_SHARE) else "FAIL"
    return f"{name:<26} {difference_share * 100:6.2f}% of pixels differ   {verdict}"


def compare_screens(names: list[str], app_address: str) -> dict[str, float]:
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    shares = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_context(**CONTEXT_OPTIONS).new_page()
        page.clock.set_fixed_time(FIXED_TIME)
        for name in names:
            shares[name] = compare_screen(page, name, app_address)
            print(format_report_line(name, shares[name]), flush=True)
        browser.close()
    return shares


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare the app's screens with the design.")
    parser.add_argument("--only", nargs="+", choices=list(SCREENS), help="compare only these screens")
    return parser.parse_args()


def main() -> int:
    names = parse_arguments().only or list(SCREENS)
    backend = start_mock_backend(create_fixture_responses(), create_fixture_events(), BACKEND_PORT)
    app_server = start_app_server()
    try:
        app_address = f"http://127.0.0.1:{APP_PORT}"
        wait_until_responding(app_address)
        shares = compare_screens(names, app_address)
    finally:
        app_server.terminate()
        backend.shutdown()
    print(f"\nTolerance: at most {MAXIMUM_DIFFERENCE_SHARE * 100:.1f}% of pixels may differ by more than {DEFAULT_CHANNEL_TOLERANCE} per channel.")
    return 0 if all(is_within_tolerance(share, MAXIMUM_DIFFERENCE_SHARE) for share in shares.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
