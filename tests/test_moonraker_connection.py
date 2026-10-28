import httpx
import pytest

from app.config import settings
from app.moonraker import MoonrakerClient
from app.moonraker_connection import ConnectionBreaker, GuardedTransport, PrinterUnreachableError

OPEN_SECONDS = 5.0
CLOSED_ADDRESS = "http://127.0.0.1:1"


class FakeClock:
    def __init__(self) -> None:
        self.seconds = 100.0

    def __call__(self) -> float:
        return self.seconds


class FakePrinterTransport(httpx.AsyncBaseTransport):
    """Answers with the given outcomes in order: an exception is raised, a response is returned."""

    def __init__(self, *outcomes: Exception | httpx.Response) -> None:
        self.outcomes = list(outcomes)
        self.requests = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def create_breaker(clock: FakeClock) -> ConnectionBreaker:
    return ConnectionBreaker(open_seconds=OPEN_SECONDS, clock=clock)


async def send(breaker: ConnectionBreaker, printer: FakePrinterTransport) -> httpx.Response:
    async with httpx.AsyncClient(transport=GuardedTransport(breaker, inner=printer)) as client:
        return await client.get("http://printer/server/info")


def test_the_breaker_is_closed_at_first() -> None:
    assert not create_breaker(FakeClock()).is_open()


def test_the_breaker_is_open_after_a_failure_and_closes_again_after_the_open_time() -> None:
    clock = FakeClock()
    breaker = create_breaker(clock)
    breaker.record_failure()
    assert breaker.is_open()
    clock.seconds += OPEN_SECONDS - 0.1
    assert breaker.is_open()
    clock.seconds += 0.2
    assert not breaker.is_open()


def test_a_success_closes_the_breaker_at_once() -> None:
    breaker = create_breaker(FakeClock())
    breaker.record_failure()
    breaker.record_success()
    assert not breaker.is_open()


def test_an_open_breaker_refuses_with_the_printer_unreachable_error() -> None:
    breaker = create_breaker(FakeClock())
    breaker.record_failure()
    with pytest.raises(PrinterUnreachableError, match="printer cannot be reached"):
        breaker.ensure_closed()


async def test_a_failed_connection_says_the_printer_cannot_be_reached_and_opens_the_breaker() -> None:
    breaker = create_breaker(FakeClock())
    printer = FakePrinterTransport(httpx.ConnectError("No route to host"))
    with pytest.raises(PrinterUnreachableError):
        await send(breaker, printer)
    assert breaker.is_open()


async def test_a_request_while_the_breaker_is_open_does_not_reach_the_printer() -> None:
    breaker = create_breaker(FakeClock())
    printer = FakePrinterTransport(httpx.ConnectTimeout("timed out"))
    with pytest.raises(PrinterUnreachableError):
        await send(breaker, printer)
    with pytest.raises(PrinterUnreachableError):
        await send(breaker, printer)
    assert printer.requests == 1


async def test_the_printer_is_tried_again_after_the_open_time_and_a_success_keeps_the_breaker_closed() -> None:
    clock = FakeClock()
    breaker = create_breaker(clock)
    printer = FakePrinterTransport(httpx.ConnectError("down"), httpx.Response(200, json={"result": {}}))
    with pytest.raises(PrinterUnreachableError):
        await send(breaker, printer)
    clock.seconds += OPEN_SECONDS
    response = await send(breaker, printer)
    assert response.status_code == 200
    assert not breaker.is_open()


async def test_an_error_answer_of_the_printer_does_not_open_the_breaker() -> None:
    breaker = create_breaker(FakeClock())
    printer = FakePrinterTransport(httpx.Response(500))
    response = await send(breaker, printer)
    assert response.status_code == 500
    assert not breaker.is_open()


async def test_a_slow_answer_does_not_open_the_breaker_because_the_printer_was_reached() -> None:
    breaker = create_breaker(FakeClock())
    printer = FakePrinterTransport(httpx.ReadTimeout("slow"))
    with pytest.raises(httpx.ReadTimeout):
        await send(breaker, printer)
    assert not breaker.is_open()


async def test_the_moonraker_client_fails_at_once_while_the_printer_is_known_to_be_off(monkeypatch) -> None:
    monkeypatch.setattr(settings, "moonraker_url", CLOSED_ADDRESS)
    client = MoonrakerClient(breaker=ConnectionBreaker())
    with pytest.raises(PrinterUnreachableError):
        await client.get("/server/info")
    assert client.breaker.is_open()
    with pytest.raises(PrinterUnreachableError):
        await client.get_files()
