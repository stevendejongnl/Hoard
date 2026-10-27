"""Renders the installed-app icons from the Hoard mark (the paths of src/logo.ts) with a headless browser.

Run from the repository root: python3 frontend/tools/render_brand_icons.py
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

PUBLIC_DIRECTORY = Path(__file__).resolve().parents[1] / "public"
ACCENT = "#f45bcb"
INK = "#1a1a1d"

FULL_MARK = (
    '<defs><mask id="gaps"><rect width="64" height="64" fill="#fff"/>'
    + "".join(f'<rect x="0" y="{y}" width="64" height="1.7" fill="#000"/>' for y in (33.2, 37.4, 41.6, 45.8))
    + "</mask></defs>"
    '<path d="M13.75 4h16v8l-5 8h-6l-5-8z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    '<g mask="url(#gaps)" fill="currentColor"><rect x="11.5" y="28" width="20.5" height="20" rx="3"/><circle cx="44" cy="39" r="9"/></g>'
    '<path d="M3 51h58v3a7 7 0 0 1-7 7H10a7 7 0 0 1-7-7z" fill="currentColor"/>'
    '<rect x="3" y="40" width="5.5" height="14" rx="2.5" fill="currentColor"/>'
    '<rect x="55.5" y="40" width="5.5" height="14" rx="2.5" fill="currentColor"/>'
)

SMALL_MARK = (
    '<path d="M13 3h18v9l-6 9h-6l-6-9z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'
    '<rect x="12" y="27" width="21" height="21" rx="4" fill="currentColor"/>'
    '<circle cx="44.5" cy="38.5" r="9.5" fill="currentColor"/>'
    '<path d="M2 51h60v3a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill="currentColor"/>'
    '<rect x="2" y="39" width="7" height="15" rx="3" fill="currentColor"/>'
    '<rect x="55" y="39" width="7" height="15" rx="3" fill="currentColor"/>'
)

# file name -> (pixel size, corner radius share of the size, share of the size the mark takes, mark)
ICONS = {
    "pwa-192.png": (192, 0.22, 0.72, FULL_MARK),
    "pwa-512.png": (512, 0.22, 0.72, FULL_MARK),
    "pwa-maskable-512.png": (512, 0, 0.56, FULL_MARK),
    "apple-touch-icon.png": (180, 0, 0.72, FULL_MARK),
    "favicon.png": (48, 0.22, 0.72, SMALL_MARK),
}


def build_page(size: int, radius_share: float, mark_share: float, mark: str) -> str:
    mark_size = size * mark_share
    offset = (size - mark_size) / 2
    return f"""<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
<rect width="{size}" height="{size}" rx="{size * radius_share}" fill="{ACCENT}"/>
<svg x="{offset}" y="{offset}" width="{mark_size}" height="{mark_size}" viewBox="0 0 64 64" color="{INK}">{mark}</svg>
</svg></body></html>"""


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for name, (size, radius_share, mark_share, mark) in ICONS.items():
            page = browser.new_page(viewport={"width": size, "height": size})
            page.set_content(build_page(size, radius_share, mark_share, mark))
            page.screenshot(path=str(PUBLIC_DIRECTORY / name), omit_background=True)
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
