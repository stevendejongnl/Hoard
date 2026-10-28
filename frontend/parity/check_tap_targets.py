"""Check that every button and link on the phone screens can be hit within 44 px of its center.

A small control may have an invisible hit area around it. The check taps (by hit test) 22 px to each side
of the center, along every side where the control is smaller than 44 px.
"""

import sys

from playwright.sync_api import Page, sync_playwright

from frontend.parity import compare_screens as screens
from frontend.parity.browser_settings import CONTEXT_OPTIONS, FIXED_TIME
from frontend.parity.fixture_data import create_fixture_events, create_fixture_responses
from frontend.parity.mock_backend import start_mock_backend

MINIMUM_TARGET_SIZE = 44

FIND_MISSED_TARGETS = """(minimum) => {
  const half = minimum / 2 - 1
  const isVisible = (element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const isHit = (element, x, y) => {
    const hit = document.elementFromPoint(x, y)
    return hit !== null && element.contains(hit)
  }
  const missed = new Map()
  for (const element of document.querySelectorAll('button, a[href], [role=button], [role=tab]')) {
    if (!isVisible(element)) continue
    const box = element.getBoundingClientRect()
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    const points = []
    if (box.width < minimum) points.push([centerX - half, centerY], [centerX + half, centerY])
    if (box.height < minimum) points.push([centerX, centerY - half], [centerX, centerY + half])
    const insideScreen = points.filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
    if (insideScreen.every(([x, y]) => isHit(element, x, y))) continue
    const name = (element.getAttribute('aria-label') || element.className || element.tagName).toString().slice(0, 50)
    missed.set(name, `${Math.round(box.width)}x${Math.round(box.height)}`)
  }
  return [...missed].map(([name, size]) => `${name} (${size})`)
}"""


def find_missed_targets(page: Page, name: str, address: str) -> list[str]:
    path, size = screens.SCREENS[name]
    page.set_viewport_size({"width": size[0], "height": size[1]})
    page.goto(f"{address}{path}", wait_until="load")
    page.wait_for_timeout(screens.SETTLE_MILLISECONDS)
    for step in screens.SCREEN_STEPS.get(name, []):
        screens.perform_step(page, step)
        page.wait_for_timeout(screens.SETTLE_MILLISECONDS)
    return page.evaluate(FIND_MISSED_TARGETS, MINIMUM_TARGET_SIZE)


def main() -> int:
    phone_screens = [name for name in screens.SCREENS if name.endswith("-phone") and not name.startswith("top-bar")]
    backend = start_mock_backend(create_fixture_responses(), create_fixture_events(), screens.BACKEND_PORT)
    app_server = screens.start_app_server()
    missed_total = 0
    try:
        address = f"http://127.0.0.1:{screens.APP_PORT}"
        screens.wait_until_responding(address)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_context(**CONTEXT_OPTIONS).new_page()
            page.clock.set_fixed_time(FIXED_TIME)
            for name in phone_screens:
                missed = find_missed_targets(page, name, address)
                missed_total += len(missed)
                print(
                    f"{name:24} {'pass' if not missed else f'FAIL {len(missed)}'}",
                    *(f"\n    {line}" for line in missed),
                )
            browser.close()
    finally:
        app_server.terminate()
        backend.shutdown()
    print(f"\nEvery button and link must be hittable within {MINIMUM_TARGET_SIZE} px of its center.")
    return 0 if missed_total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
