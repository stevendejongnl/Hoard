"""The top bar with its notification bell, compared as a crop of the board against the top of the app."""

from dataclasses import dataclass

Box = tuple[int, int, int, int]

PUSH_KEY_ENDPOINT = "/api/push/vapid-public-key"


@dataclass(frozen=True)
class TopBarCrop:
    board_file: str
    board_size: tuple[int, int]
    # x, y, width, height of the header inside the board (measured from its layout)
    board_box: Box
    # x, y, width, height of the header at the top of the app screen
    app_box: Box
    # answers the app gets for this screen on top of the usual fixture, so that push looks configured
    served_responses: dict[str, object]


TOP_BAR_CROPS = {
    "top-bar-desktop": TopBarCrop(
        board_file="TopBar.dc.html",
        board_size=(1360, 330),
        board_box=(0, 38, 1360, 49),
        app_box=(0, 0, 1360, 49),
        served_responses={PUSH_KEY_ENDPOINT: {"key": "parity"}},
    ),
    "top-bar-phone": TopBarCrop(
        board_file="TopBar.dc.html",
        board_size=(1360, 330),
        board_box=(17, 229, 390, 53),
        app_box=(0, 0, 390, 53),
        served_responses={PUSH_KEY_ENDPOINT: {"key": "parity"}},
    ),
}
