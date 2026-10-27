"""Render the design artboards to reference images for the pixel parity checks.

The design artboards are `.dc.html` files that need the design runtime. The runtime belongs to the
design tool and is not stored in this repository: pass its path with `--runtime`.
The browser may only reach this machine; Google Fonts requests are answered with the same local
font files the app uses, so text renders the same in the reference and in the app.

Usage:
    python3 -m frontend.parity.render_design_references --runtime /path/to/dc-runtime.js
"""

import argparse
import functools
import http.server
import shutil
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import Page, Route, sync_playwright

from frontend.parity.browser_settings import (
    CONTEXT_OPTIONS,
    DESKTOP_SIZE,
    FIXED_TIME,
    FREEZE_MOTION_STYLE,
    PHONE_SIZE,
)

PARITY_DIRECTORY = Path(__file__).resolve().parent
DESIGN_DIRECTORY = PARITY_DIRECTORY / "design"
REFERENCE_DIRECTORY = PARITY_DIRECTORY / "references"
FONT_FILES_DIRECTORY = PARITY_DIRECTORY.parent / "node_modules" / "@fontsource"

# design file name -> (reference file name, viewport size)
SCREENS = {
    "Main.dc.html": ("dashboard-desktop", DESKTOP_SIZE),
    "History.dc.html": ("history-desktop", DESKTOP_SIZE),
    "Projects.dc.html": ("projects-desktop", DESKTOP_SIZE),
    "ProjectDetail.dc.html": ("project-detail-desktop", DESKTOP_SIZE),
    "Spools.dc.html": ("spools-desktop", DESKTOP_SIZE),
    "MainMobile.dc.html": ("dashboard-phone", PHONE_SIZE),
    "HistoryMobile.dc.html": ("history-phone", PHONE_SIZE),
    "ProjectsMobile.dc.html": ("projects-phone", PHONE_SIZE),
    "ProjectDetailMobile.dc.html": ("project-detail-phone", PHONE_SIZE),
    "SpoolsMobile.dc.html": ("spools-phone", PHONE_SIZE),
    "PrintDetail.dc.html": ("print-detail-desktop", DESKTOP_SIZE),
    "Search.dc.html": ("search-desktop", DESKTOP_SIZE),
    "FileBrowser.dc.html": ("file-browser-desktop", DESKTOP_SIZE),
    "PrintReady.dc.html": ("print-ready-desktop", DESKTOP_SIZE),
    "SpoolSheet.dc.html": ("spool-sheet-phone", PHONE_SIZE),
}

FONT_FACES = [
    ("Barlow", 400, "barlow", "barlow-latin-400-normal.woff2"),
    ("Barlow", 500, "barlow", "barlow-latin-500-normal.woff2"),
    ("Barlow", 600, "barlow", "barlow-latin-600-normal.woff2"),
    ("Barlow", 700, "barlow", "barlow-latin-700-normal.woff2"),
    ("JetBrains Mono", 400, "jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2"),
    ("JetBrains Mono", 500, "jetbrains-mono", "jetbrains-mono-latin-500-normal.woff2"),
]


def build_font_stylesheet(server_address: str) -> str:
    rules = [
        f"@font-face {{ font-family: '{family}'; font-weight: {weight}; font-style: normal; "
        f"src: url('{server_address}/fonts/{file_name}') format('woff2'); }}"
        for family, weight, _package, file_name in FONT_FACES
    ]
    return "\n".join(rules)


def copy_fonts(target_directory: Path) -> None:
    target_directory.mkdir(parents=True, exist_ok=True)
    for _family, _weight, package, file_name in FONT_FACES:
        shutil.copy(FONT_FILES_DIRECTORY / package / "files" / file_name, target_directory / file_name)


def assemble_site(site_directory: Path, runtime_path: Path) -> None:
    for design_file in DESIGN_DIRECTORY.glob("*.dc.html"):
        shutil.copy(design_file, site_directory / design_file.name)
    shutil.copy(runtime_path, site_directory / "support.js")
    copy_fonts(site_directory / "fonts")


def start_server(site_directory: Path) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site_directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def is_local_request(url: str, server_address: str) -> bool:
    return url.startswith(server_address)


def answer_request(route: Route, server_address: str, font_stylesheet: str) -> None:
    url = route.request.url
    if is_local_request(url, server_address):
        route.continue_()
        return
    if "fonts.googleapis.com" in url:
        route.fulfill(status=200, content_type="text/css", body=font_stylesheet)
        return
    route.abort()


def render_screen(page: Page, server_address: str, design_file: str, size: tuple[int, int], target: Path) -> None:
    page.set_viewport_size({"width": size[0], "height": size[1]})
    page.goto(f"{server_address}/{design_file}", wait_until="networkidle")
    page.add_style_tag(content=FREEZE_MOTION_STYLE)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(300)
    page.screenshot(path=str(target), clip={"x": 0, "y": 0, "width": size[0], "height": size[1]})


def render_all_screens(server_address: str) -> None:
    REFERENCE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    font_stylesheet = build_font_stylesheet(server_address)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_context(**CONTEXT_OPTIONS).new_page()
        page.clock.set_fixed_time(FIXED_TIME)
        page.route("**/*", lambda route: answer_request(route, server_address, font_stylesheet))
        for design_file, (reference_name, size) in SCREENS.items():
            render_screen(page, server_address, design_file, size, REFERENCE_DIRECTORY / f"{reference_name}.png")
            print("rendered", reference_name)
        browser.close()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render the design artboards to reference images.")
    parser.add_argument("--runtime", required=True, type=Path, help="path to the design runtime script")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    with tempfile.TemporaryDirectory() as temporary_directory:
        site_directory = Path(temporary_directory)
        assemble_site(site_directory, arguments.runtime)
        server = start_server(site_directory)
        server_address = f"http://127.0.0.1:{server.server_address[1]}"
        render_all_screens(server_address)
        server.shutdown()


if __name__ == "__main__":
    main()
