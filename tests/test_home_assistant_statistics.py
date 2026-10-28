import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from app import ha
from app.config import settings

START = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
END = datetime(2026, 1, 1, 13, 0, tzinfo=UTC)
START_MS = START.timestamp() * 1000
END_MS = END.timestamp() * 1000


class FakeWebSocket:
    def __init__(self, replies: list[dict[str, Any]]) -> None:
        self.replies = [json.dumps(reply) for reply in replies]
        self.sent: list[dict[str, Any]] = []

    async def recv(self) -> str:
        return self.replies.pop(0)

    async def send(self, message: str) -> None:
        self.sent.append(json.loads(message))


class FakeConnection:
    def __init__(self, websocket: FakeWebSocket | Exception) -> None:
        self.websocket = websocket
        self.address = ""
        self.options: dict[str, Any] = {}

    def __call__(self, address: str, **options: Any) -> "FakeConnection":
        self.address = address
        self.options = options
        return self

    async def __aenter__(self) -> FakeWebSocket:
        if isinstance(self.websocket, Exception):
            raise self.websocket
        return self.websocket

    async def __aexit__(self, *exception_details: Any) -> None:
        return None


def ask_statistics(connection: FakeConnection, monkeypatch) -> Any:
    app_settings = SimpleNamespace(ha_url="https://home.example", ha_token="secret-token")
    return ha._ws_statistics_during_period(["sensor.energy"], START, END, connect=connection, app_settings=app_settings)


SUCCESS = [
    {"type": "auth_required"},
    {"type": "auth_ok"},
    {"success": True, "result": {"sensor.energy": [{"sum": 1.0, "end": 5}]}},
]


async def test_the_statistics_are_asked_over_the_websocket_with_a_wider_window(monkeypatch) -> None:
    websocket = FakeWebSocket(SUCCESS)
    connection = FakeConnection(websocket)
    assert await ask_statistics(connection, monkeypatch) == {"sensor.energy": [{"sum": 1.0, "end": 5}]}
    assert connection.address == "wss://home.example/api/websocket"
    assert websocket.sent == [
        {"type": "auth", "access_token": "secret-token"},
        {
            "id": 1,
            "type": "recorder/statistics_during_period",
            "start_time": "2026-01-01T11:00:00+00:00",
            "end_time": "2026-01-01T13:10:00+00:00",
            "statistic_ids": ["sensor.energy"],
            "period": "5minute",
            "units": {"energy": "kWh"},
        },
    ]


async def test_an_unexpected_greeting_gives_no_statistics(monkeypatch) -> None:
    connection = FakeConnection(FakeWebSocket([{"type": "hello"}]))
    assert await ask_statistics(connection, monkeypatch) == {}


async def test_a_refused_login_gives_no_statistics(monkeypatch) -> None:
    connection = FakeConnection(FakeWebSocket([{"type": "auth_required"}, {"type": "auth_invalid"}]))
    assert await ask_statistics(connection, monkeypatch) == {}


async def test_an_unsuccessful_answer_gives_no_statistics(monkeypatch) -> None:
    connection = FakeConnection(FakeWebSocket([*SUCCESS[:2], {"success": False}]))
    assert await ask_statistics(connection, monkeypatch) == {}


async def test_a_result_that_is_no_dictionary_gives_no_statistics(monkeypatch) -> None:
    connection = FakeConnection(FakeWebSocket([*SUCCESS[:2], {"success": True, "result": []}]))
    assert await ask_statistics(connection, monkeypatch) == {}


async def test_a_connection_error_gives_no_statistics(monkeypatch) -> None:
    connection = FakeConnection(OSError("unreachable"))
    assert await ask_statistics(connection, monkeypatch) == {}


def energy_from(monkeypatch, statistics: dict[str, Any], sensors: str = "sensor.old,sensor.new") -> Any:
    async def fake_statistics(statistic_ids: list[str], start, end) -> dict:
        return statistics

    monkeypatch.setattr(settings, "ha_energy_sensors", sensors)
    monkeypatch.setattr(ha, "_ws_statistics_during_period", fake_statistics)
    return ha.energy_used_kwh(START, END)


async def test_the_energy_is_the_sum_at_the_end_minus_the_sum_before_the_start(monkeypatch) -> None:
    points = [
        {"sum": 10.0, "end": START_MS - 600_000},
        {"sum": 10.5, "end": START_MS},
        {"sum": 11.0, "end": START_MS + 1000},
        {"sum": 11.23456, "end": END_MS},
        {"sum": 99.0, "end": END_MS + 1000},
        {"sum": None, "end": END_MS - 1},
    ]
    assert await energy_from(monkeypatch, {"sensor.old": points}) == 0.7346


async def test_the_first_sensor_that_brackets_the_print_is_used(monkeypatch) -> None:
    statistics = {
        "sensor.old": [{"sum": 5.0, "end": START_MS + 1000}],
        "sensor.new": [{"sum": 1.0, "end": START_MS}, {"sum": 3.0, "end": END_MS}],
    }
    assert await energy_from(monkeypatch, statistics) == 2.0


async def test_sensors_without_points_or_with_a_list_that_is_none_are_skipped(monkeypatch) -> None:
    statistics = {"sensor.old": [], "sensor.new": "text"}
    assert await energy_from(monkeypatch, statistics) is None


async def test_a_falling_counter_gives_zero_energy(monkeypatch) -> None:
    points = [{"sum": 9.0, "end": START_MS}, {"sum": 8.0, "end": END_MS}]
    assert await energy_from(monkeypatch, {"sensor.old": points}) == 0.0
