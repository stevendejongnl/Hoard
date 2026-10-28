import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.moonraker import MoonrakerClient

SETTINGS = SimpleNamespace(moonraker_url="http://printer", moonraker_ws="ws://printer/websocket")


class FakeResponse:
    def __init__(self, body: Any = None, content: bytes = b"", status_code: int = 200) -> None:
        self.body = body if body is not None else {}
        self.content = content
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")

    def json(self) -> Any:
        return self.body


class FakeHttpClient:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.requests: list[tuple[str, str, dict[str, Any]]] = []

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exception_details: Any) -> None:
        return None

    async def get(self, url: str, **keywords: Any) -> FakeResponse:
        self.requests.append(("get", url, keywords))
        return self.response

    async def post(self, url: str, **keywords: Any) -> FakeResponse:
        self.requests.append(("post", url, keywords))
        return self.response


def build_client(response: FakeResponse) -> tuple[MoonrakerClient, FakeHttpClient]:
    http_client = FakeHttpClient(response)
    return MoonrakerClient(app_settings=SETTINGS, http_client_factory=lambda: http_client), http_client


async def test_a_get_sends_the_parameters_and_returns_the_result_of_the_answer() -> None:
    client, http_client = build_client(FakeResponse({"result": {"a": 1}}))
    assert await client.get("/server/info", limit=5) == {"a": 1}
    assert http_client.requests == [("get", "http://printer/server/info", {"params": {"limit": 5}, "timeout": 15})]


async def test_a_get_without_parameters_sends_none_and_an_answer_without_result_is_returned_whole() -> None:
    client, http_client = build_client(FakeResponse({"b": 2}))
    assert await client.get("/server/info") == {"b": 2}
    assert http_client.requests[0][2]["params"] is None


async def test_a_post_sends_the_data_as_json() -> None:
    client, http_client = build_client(FakeResponse({"result": "ok"}))
    assert await client.post("/printer/print/start", filename="a.gcode") == "ok"
    assert http_client.requests == [
        ("post", "http://printer/printer/print/start", {"json": {"filename": "a.gcode"}, "timeout": 15})
    ]


async def test_a_failing_request_raises() -> None:
    client, _http_client = build_client(FakeResponse(status_code=500))
    with pytest.raises(RuntimeError):
        await client.get("/server/info")


async def test_a_partial_download_asks_for_a_byte_range_and_accepts_partial_content() -> None:
    client, http_client = build_client(FakeResponse(content=b"head", status_code=206))
    assert await client.download_file_partial("a.gcode", size=100) == b"head"
    assert http_client.requests[0][2]["headers"] == {"Range": "bytes=0-99"}


async def test_the_history_job_is_unwrapped_from_the_job_key() -> None:
    client, _http_client = build_client(FakeResponse({"result": {"job": {"job_id": "x"}}}))
    assert await client.get_history_job("x") == {"job_id": "x"}


class RecordingHandlers:
    def __init__(self) -> None:
        self.calls: list[list[Any]] = []
        self.fail = False

    async def __call__(self, params: list[Any]) -> None:
        self.calls.append(params)
        if self.fail:
            raise RuntimeError("handler failed")


async def test_a_notification_goes_to_the_handlers_of_its_method() -> None:
    client = MoonrakerClient(app_settings=SETTINGS)
    handler, other = RecordingHandlers(), RecordingHandlers()
    client.on("notify_history_changed", handler)
    client.on("notify_other", other)
    await client._dispatch(json.dumps({"method": "notify_history_changed", "params": [{"action": "added"}]}))
    assert handler.calls == [[{"action": "added"}]]
    assert other.calls == []


async def test_the_subscription_result_is_handled_as_a_status_update() -> None:
    client = MoonrakerClient(app_settings=SETTINGS)
    handler = RecordingHandlers()
    client.on("notify_status_update", handler)
    await client._dispatch(json.dumps({"result": {"status": {"extruder": {}}}}))
    assert handler.calls == [[{"extruder": {}}]]


async def test_a_failing_handler_and_invalid_json_do_not_stop_the_dispatch() -> None:
    client = MoonrakerClient(app_settings=SETTINGS)
    failing, following = RecordingHandlers(), RecordingHandlers()
    failing.fail = True
    client.on("notify_history_changed", failing)
    client.on("notify_history_changed", following)
    await client._dispatch("not json")
    await client._dispatch(json.dumps({"method": "notify_history_changed", "params": [1]}))
    assert following.calls == [[1]]
