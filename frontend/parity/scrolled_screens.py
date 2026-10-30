"""Phone screens that continue below the fold, compared at a fixed scroll position."""

from typing import NamedTuple


class ScrolledScreen(NamedTuple):
    board_file: str
    board_scroller: str
    app_scroller: str
    scroll_top: int


SCROLLED_SCREENS = {
    "dashboard-parameters-phone": ScrolledScreen("MainMobile.dc.html", "main", ".app-content", 700),
}
