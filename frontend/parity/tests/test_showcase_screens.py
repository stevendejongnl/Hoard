from pathlib import Path

from frontend.parity.showcase_screens import SHOWCASE_SCREENS

REFERENCE_DIRECTORY = Path(__file__).resolve().parents[1] / "references"


def test_every_showcase_screen_is_a_screen_with_a_reference() -> None:
    for screen_name in SHOWCASE_SCREENS:
        assert (REFERENCE_DIRECTORY / f"{screen_name}.png").exists(), screen_name


def test_the_screenshots_have_distinct_png_file_names() -> None:
    file_names = list(SHOWCASE_SCREENS.values())
    assert all(file_name.endswith(".png") for file_name in file_names)
    assert len(set(file_names)) == len(file_names)


def test_the_readme_shows_both_the_desktop_and_the_phone() -> None:
    assert "dashboard-desktop" in SHOWCASE_SCREENS
    assert "dashboard-phone" in SHOWCASE_SCREENS
