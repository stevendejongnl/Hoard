"""Hand-written fakes for the collaborators of the routes, and the one place that hands them to the app."""

from datetime import datetime
from typing import Any

import httpx

from app import ha
from app.influx import influx as real_influx
from app.main import app
from app.moonraker import moonraker as real_moonraker
from app.routes.dependencies import provide_home_assistant, provide_influx, provide_moonraker


class FakeMoonraker:
    """Answers get() from a table of path -> result; a result that is an Exception is raised."""

    def __init__(self, answers: dict[str, Any] | None = None) -> None:
        self.answers = answers or {}
        self.asked: list[tuple[str, dict[str, Any]]] = []
        self.posted: list[tuple[str, dict[str, Any]]] = []
        self.uploaded: list[tuple[str, bytes]] = []
        self.metadata: Any = {}
        self.files: Any = []
        self.failure: Exception | None = None
        self.gcode: bytes | None = None
        self.downloads: list[str] = []

    def _client_base(self) -> str:
        return "http://printer.test"

    async def get(self, path: str, **params: Any) -> Any:
        self.asked.append((path, params))
        answer = self.answers.get(path, {})
        if isinstance(answer, Exception):
            raise answer
        return answer

    async def post(self, path: str, **data: Any) -> Any:
        self.posted.append((path, data))
        if self.failure:
            raise self.failure
        return {}

    async def upload_file(self, filename: str, content: bytes) -> Any:
        self.uploaded.append((filename, content))
        if self.failure:
            raise self.failure
        return {"item": {"path": filename}}

    async def get_files(self) -> Any:
        if self.failure:
            raise self.failure
        return self.files

    async def download_file(self, filename: str) -> bytes:
        self.downloads.append(filename)
        if self.gcode is None:
            raise httpx.ConnectError("no such file")
        return self.gcode

    async def download_file_partial(self, filename: str, size: int = 131072) -> bytes:
        return await self.download_file(filename)

    async def get_file_metadata(self, filename: str) -> Any:
        if self.failure:
            raise self.failure
        return self.metadata


class FakeInflux:
    def __init__(self, history: list[dict[str, Any]] | None = None) -> None:
        self.history = history or []
        self.by_end_time: dict[tuple[str, float], dict[str, Any]] = {}
        self.deleted: list[tuple[datetime, str]] = []
        self.written: list[dict[str, Any]] = []
        self.limits: list[int] = []

    async def query_history(self, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        self.limits.append(limit)
        return self.history

    async def query_by_end_time(self, filename: str, end_time_s: float) -> dict[str, Any] | None:
        return self.by_end_time.get((filename, end_time_s))

    async def delete_print_job(self, timestamp: datetime, filename: str) -> None:
        self.deleted.append((timestamp, filename))

    async def write_print_job(self, **fields: Any) -> None:
        self.written.append(fields)


class FakeHomeAssistant:
    def __init__(
        self,
        energy_kwh: float | None = None,
        average_watts: float = 0.0,
        average_price: float = 0.0,
        states: dict[str, str] | None = None,
    ) -> None:
        self.energy_kwh = energy_kwh
        self.average_watts = average_watts
        self.average_price = average_price
        self.states = states or {}

    async def energy_used_kwh(self, start: datetime, end: datetime) -> float | None:
        return self.energy_kwh

    async def avg_power_over(self, start: datetime, end: datetime) -> float:
        return self.average_watts

    async def avg_price_over(self, start: datetime, end: datetime) -> float:
        return self.average_price

    async def avg_price_hours(self, hours: int = 27) -> float:
        return self.average_price

    async def get_state(self, entity_id: str) -> dict[str, Any]:
        if entity_id not in self.states:
            raise httpx.ConnectError("unreachable")
        return {"state": self.states[entity_id]}


PROVIDERS = {
    "moonraker": provide_moonraker,
    "influx": provide_influx,
    "home_assistant": provide_home_assistant,
}
REAL_COLLABORATORS = {"moonraker": real_moonraker, "influx": real_influx, "home_assistant": ha}


def provide(fake):
    return lambda: fake


def install_fakes(monkeypatch, **fakes) -> None:
    """Hand the fakes to the app in place of the real collaborators."""
    for name, fake in fakes.items():
        if fake is None:
            continue
        monkeypatch.setitem(app.dependency_overrides, PROVIDERS[name], provide(fake))
        for attribute in dir(type(fake)):
            if not attribute.startswith("_"):
                monkeypatch.setattr(REAL_COLLABORATORS[name], attribute, getattr(fake, attribute))
