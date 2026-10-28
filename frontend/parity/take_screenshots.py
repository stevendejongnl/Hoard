"""Takes the screenshots of the README from the app, filled with the sample data of the comparison.

Run from the repository root: python3 -m frontend.parity.take_screenshots
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

from frontend.parity.browser_settings import CONTEXT_OPTIONS, FIXED_TIME
from frontend.parity.compare_screens import (
    APP_PORT,
    BACKEND_PORT,
    SCREEN_STEPS,
    SCREENS,
    capture_screen,
    start_app_server,
    wait_until_responding,
)
from frontend.parity.fixture_data import create_fixture_events, create_fixture_responses
from frontend.parity.mock_backend import start_mock_backend
from frontend.parity.showcase_screens import SHOWCASE_SCREENS

SCREENSHOT_DIRECTORY = Path(__file__).resolve().parents[2] / "docs" / "screenshots"


def take_screenshots(app_address: str) -> None:
    SCREENSHOT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_context(**CONTEXT_OPTIONS).new_page()
        page.clock.set_fixed_time(FIXED_TIME)
        for screen_name, file_name in SHOWCASE_SCREENS.items():
            path, size = SCREENS[screen_name]
            capture_screen(
                page, f"{app_address}{path}", size, SCREENSHOT_DIRECTORY / file_name, SCREEN_STEPS.get(screen_name)
            )
            print("saved", file_name, flush=True)
        browser.close()


def main() -> None:
    backend = start_mock_backend(create_fixture_responses(), create_fixture_events(), BACKEND_PORT)
    app_server = start_app_server()
    try:
        app_address = f"http://127.0.0.1:{APP_PORT}"
        wait_until_responding(app_address)
        take_screenshots(app_address)
    finally:
        app_server.terminate()
        backend.shutdown()


if __name__ == "__main__":
    main()
