"""Keeps a printer that is off from making every request wait for the network timeout.

After a connection failure the breaker stays open for a few seconds: requests fail at once with
PrinterUnreachableError, and after that the next request tries the printer again.
"""

import time
from collections.abc import Callable

import httpx

CONNECT_TIMEOUT_SECONDS = 3.0
BREAKER_OPEN_SECONDS = 5.0
PRINTER_UNREACHABLE_MESSAGE = "The printer cannot be reached"


class PrinterUnreachableError(Exception):
    def __init__(self) -> None:
        super().__init__(PRINTER_UNREACHABLE_MESSAGE)


class ConnectionBreaker:
    def __init__(self, open_seconds: float = BREAKER_OPEN_SECONDS, clock: Callable[[], float] = time.monotonic) -> None:
        self._open_seconds = open_seconds
        self._clock = clock
        self._opened_at: float | None = None

    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        return self._clock() - self._opened_at < self._open_seconds

    def ensure_closed(self) -> None:
        if self.is_open():
            raise PrinterUnreachableError

    def record_failure(self) -> None:
        self._opened_at = self._clock()

    def record_success(self) -> None:
        self._opened_at = None


class GuardedTransport(httpx.AsyncBaseTransport):
    """An HTTP transport that answers at once while the breaker is open. Only a failed connection opens it."""

    def __init__(self, breaker: ConnectionBreaker, inner: httpx.AsyncBaseTransport | None = None) -> None:
        self._breaker = breaker
        self._inner = inner or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self._breaker.ensure_closed()
        try:
            response = await self._inner.handle_async_request(request)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            self._breaker.record_failure()
            raise PrinterUnreachableError from exc
        self._breaker.record_success()
        return response

    async def aclose(self) -> None:
        await self._inner.aclose()
