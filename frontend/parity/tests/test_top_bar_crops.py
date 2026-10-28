from frontend.parity.browser_settings import DESKTOP_SIZE, PHONE_SIZE
from frontend.parity.top_bar_crops import TOP_BAR_CROPS


def test_the_bell_is_compared_on_the_desktop_and_the_phone_header() -> None:
    assert set(TOP_BAR_CROPS) == {"top-bar-desktop", "top-bar-phone"}


def test_the_board_crop_and_the_app_crop_have_the_same_size() -> None:
    for crop in TOP_BAR_CROPS.values():
        assert (crop.board_box[2], crop.board_box[3]) == (crop.app_box[2], crop.app_box[3])


def test_the_app_crop_is_the_top_of_a_screen_of_the_size_it_is_taken_at() -> None:
    sizes = {"top-bar-desktop": DESKTOP_SIZE, "top-bar-phone": PHONE_SIZE}
    for name, crop in TOP_BAR_CROPS.items():
        assert crop.app_box[:2] == (0, 0)
        assert crop.app_box[2] == sizes[name][0]


def test_the_push_key_is_served_so_the_bell_shows() -> None:
    for crop in TOP_BAR_CROPS.values():
        assert crop.served_responses["/api/push/vapid-public-key"] == {"key": "parity"}
