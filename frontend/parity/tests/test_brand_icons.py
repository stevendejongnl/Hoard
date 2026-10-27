import json
from collections import Counter
from pathlib import Path

import pytest
from PIL import Image

PUBLIC_DIRECTORY = Path(__file__).resolve().parents[2] / "public"
ACCENT = (244, 91, 203)
INK = (26, 26, 29)

ICONS = {
    "pwa-192.png": 192,
    "pwa-512.png": 512,
    "pwa-maskable-512.png": 512,
    "apple-touch-icon.png": 180,
    "favicon.png": 48,
}


def read_opaque_colors(name: str) -> list[tuple[int, int, int]]:
    image = Image.open(PUBLIC_DIRECTORY / name).convert("RGBA")
    counts = Counter(pixel[:3] for pixel in image.getdata() if pixel[3] == 255)
    return [color for color, _ in counts.most_common(2)]


@pytest.mark.parametrize("name,size", ICONS.items())
def test_icon_has_its_size(name, size):
    assert Image.open(PUBLIC_DIRECTORY / name).size == (size, size)


@pytest.mark.parametrize("name", ICONS)
def test_icon_is_the_hoard_mark_in_ink_on_the_accent(name):
    assert set(read_opaque_colors(name)) == {ACCENT, INK}


def test_maskable_icon_fills_its_whole_square():
    image = Image.open(PUBLIC_DIRECTORY / "pwa-maskable-512.png").convert("RGBA")
    assert image.getpixel((0, 0))[3] == 255
    assert image.getpixel((511, 511))[3] == 255


def test_manifest_points_its_maskable_icon_at_the_maskable_file():
    manifest = json.loads((PUBLIC_DIRECTORY / "manifest.webmanifest").read_text())
    maskable = [icon for icon in manifest["icons"] if icon.get("purpose") == "maskable"]
    assert [icon["src"] for icon in maskable] == ["/pwa-maskable-512.png"]
