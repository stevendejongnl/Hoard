from httpx import AsyncClient

from tests.route_fakes import FakeMoonraker, install_fakes


async def test_klipper_ready_says_so(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker({"/printer/info": {"state": "ready", "state_message": "Printer is ready"}})
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/klipper")).json() == {"state": "ready", "message": "Printer is ready"}


async def test_klipper_in_shutdown_gives_what_it_says(client: AsyncClient, monkeypatch):
    message = "Lost communication with MCU 'mcu'\nPrinter is shutdown"
    moonraker = FakeMoonraker({"/printer/info": {"state": "shutdown", "state_message": message}})
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/klipper")).json() == {"state": "shutdown", "message": message}


async def test_klipper_that_does_not_answer_is_disconnected_when_moonraker_still_does(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker(
        {"/printer/info": RuntimeError("503"), "/server/info": {"klippy_state": "disconnected"}},
    )
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/klipper")).json() == {"state": "disconnected", "message": ""}


async def test_the_state_is_a_502_when_the_printer_host_does_not_answer(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker({"/printer/info": RuntimeError("offline"), "/server/info": RuntimeError("offline")})
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/control/klipper")
    assert (response.status_code, response.json()["detail"]) == (502, "offline")


async def test_a_log_is_downloaded_as_a_text_file(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.logs = {"klippy": b"line one\nline two\n", "moonraker": b"other"}
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/control/logs/klippy")
    assert response.status_code == 200
    assert response.content == b"line one\nline two\n"
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["content-disposition"] == 'attachment; filename="klippy.log"'


async def test_a_log_that_is_not_klippy_or_moonraker_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker())
    assert (await client.get("/api/control/logs/passwd")).status_code == 404


async def test_a_log_the_printer_does_not_give_is_a_502(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("no such file")
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/logs/klippy")).status_code == 502


CONFIG = {
    "config": {
        "server": {},
        "update_manager client fluidd": {"type": "web"},
        "update_manager mainsail": {"type": "web"},
        "update_manager client klipper": {"type": "git_repo"},
    }
}


async def test_the_web_clients_on_the_printer_host_are_linked(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker({"/server/config": CONFIG}))
    assert (await client.get("/api/control/web_clients")).json() == [
        {"name": "Fluidd", "url": "http://printer.test"},
        {"name": "Mainsail", "url": "http://printer.test"},
    ]


async def test_no_web_client_gives_no_link(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker({"/server/config": {"config": {"update_manager client klipper": {}}}})
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/web_clients")).json() == []


async def test_a_printer_host_that_does_not_say_gives_no_link_and_no_error(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker({"/server/config": RuntimeError("offline")}))
    response = await client.get("/api/control/web_clients")
    assert (response.status_code, response.json()) == (200, [])
