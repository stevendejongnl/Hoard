import httpx
import pytest
from httpx import AsyncClient

from app.moonraker_connection import PrinterUnreachableError
from app.printer_errors import explain_printer_error
from tests.route_fakes import FakeMoonraker, install_fakes

PRINTER_ADDRESS = "http://192.168.1.102/printer/gcode/script"
SHUTDOWN = {"state": "shutdown", "message": "Lost communication with MCU 'mcu'\nPrinter is shutdown\n"}


def refused(status: int, body: dict | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", PRINTER_ADDRESS)
    return httpx.HTTPStatusError(
        "refused", request=request, response=httpx.Response(status, json=body, request=request)
    )


def test_klipper_that_is_not_ready_is_named_with_its_own_message():
    status, text = explain_printer_error(refused(400), SHUTDOWN)
    assert status == 503
    assert text.startswith("Klipper is shutdown: Lost communication with MCU 'mcu'.")
    assert "restart" in text.lower()
    assert "192.168" not in text


def test_a_ready_klipper_does_not_explain_a_refusal_by_its_state():
    body = {"error": {"code": 400, "message": "Unknown command"}}
    status, text = explain_printer_error(refused(400, body), {"state": "ready", "message": ""})
    assert (status, text) == (502, "The printer refused the command (400): Unknown command")


def test_a_refusal_without_a_message_gives_the_status_and_no_address():
    status, text = explain_printer_error(refused(404), None)
    assert status == 502
    assert text.startswith("The printer refused the command (404)")
    assert "192.168" not in text


@pytest.mark.parametrize(
    "failure",
    [PrinterUnreachableError(), httpx.ConnectError("no route"), httpx.ConnectTimeout("slow")],
)
def test_a_printer_that_cannot_be_reached_says_it_may_be_off(failure):
    assert explain_printer_error(failure, None) == (502, "Hoard cannot reach the printer. Is it switched on?")


def test_a_printer_that_is_too_slow_is_a_504():
    status, text = explain_printer_error(httpx.ReadTimeout("slow"), None)
    assert (status, text) == (504, "The printer did not answer in time. Try again in a moment.")


def test_another_failure_keeps_its_own_text():
    assert explain_printer_error(RuntimeError("boom"), None) == (502, "boom")


async def test_a_command_to_a_shut_down_klipper_explains_why(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker(
        {
            "/printer/objects/query": {"status": {"print_stats": {"state": "standby"}}},
            "/printer/info": {"state": "shutdown", "state_message": "Lost communication with MCU 'mcu'\n"},
        }
    )
    moonraker.failure = refused(400)
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/control/speed", json={"percent": 100})
    assert response.status_code == 503
    assert response.json()["detail"].startswith("Klipper is shutdown: Lost communication with MCU 'mcu'.")


async def test_reading_the_status_of_an_unreachable_printer_says_so(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker({"/printer/objects/list": PrinterUnreachableError()})
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/control/status")
    assert (response.status_code, response.json()["detail"]) == (
        502,
        "Hoard cannot reach the printer. Is it switched on?",
    )
