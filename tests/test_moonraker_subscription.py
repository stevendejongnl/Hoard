import json
from typing import Any

import httpx

from app.moonraker import MoonrakerClient


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, message: str) -> None:
        self.sent.append(message)


async def no_sleep(seconds: float) -> None:
    return None


async def test_the_subscription_asks_for_the_file_position_next_to_the_slicer_progress() -> None:
    socket = FakeSocket()
    await MoonrakerClient()._subscribe(socket)  # type: ignore[arg-type]
    subscribed = json.loads(socket.sent[0])["params"]["objects"]
    assert "virtual_sdcard" in subscribed
    assert "display_status" in subscribed


async def test_the_first_state_query_asks_for_the_file_position_too() -> None:
    queries: list[dict[str, Any]] = []

    def answer(request: httpx.Request) -> httpx.Response:
        queries.append(dict(request.url.params))
        return httpx.Response(200, json={"result": {"status": {}}})

    client = MoonrakerClient(
        http_client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(answer)),
        sleep=no_sleep,
    )
    await client._seed_initial_state()
    assert "virtual_sdcard" in queries[0]
    assert "display_status" in queries[0]
