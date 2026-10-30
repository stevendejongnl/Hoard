"""Phone screens that continue below the fold, compared at a fixed scroll position."""

from typing import NamedTuple


class ScrolledScreen(NamedTuple):
    board_file: str
    board_scroller: str
    app_scroller: str
    scroll_top: int
    path: str = "/"


SCROLLED_SCREENS = {
    "dashboard-parameters-phone": ScrolledScreen("MainMobile.dc.html", "main", ".app-content", 700),
    "dashboard-lists-phone": ScrolledScreen("MainMobile.dc.html", "main", ".app-content", 1400),
    "system-sections-phone": ScrolledScreen("SystemMobile.dc.html", "main", ".app-content", 800, "/system"),
}
