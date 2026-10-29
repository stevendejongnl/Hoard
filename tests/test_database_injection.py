import aiosqlite
import pytest

from app import db
from app.db import Database
from app.routes.dependencies import provide_database
from tests.route_fakes import override_provider

SPOOL = {
    "brand": "eSUN",
    "material": "PLA",
    "color": "Black",
    "color_hex": None,
    "notes": None,
    "cost_per_gram": 0.012,
    "initial_weight_g": 1000,
    "current_weight_g": 612,
}


async def create_database(tmp_path, name: str) -> Database:
    database = Database(str(tmp_path / name))
    await database.initialise()
    return database


class RecordingConnect:
    """Opens real connections and remembers how they were asked for."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, path: str, **options):
        self.calls.append((path, options))
        return aiosqlite.connect(path, **options)


async def test_two_databases_do_not_see_each_others_rows(tmp_path):
    first = await create_database(tmp_path, "first.db")
    second = await create_database(tmp_path, "second.db")
    await first.create_spool(SPOOL)
    assert [spool["brand"] for spool in await first.list_spools()] == ["eSUN"]
    assert await second.list_spools() == []


async def test_a_query_opens_its_connection_through_the_injected_connect_with_the_timeout(tmp_path):
    await create_database(tmp_path, "injected.db")
    connect = RecordingConnect()
    database = Database(str(tmp_path / "injected.db"), connect=connect, timeout=2.5)
    await database.list_spools()
    assert connect.calls == [(str(tmp_path / "injected.db"), {"timeout": 2.5})]


async def test_the_module_functions_are_the_methods_of_the_default_database(tmp_path):
    await db.init_db(str(tmp_path / "default.db"))
    created = await db.create_spool(SPOOL)
    assert await db.default_database.get_active_spool() is None
    assert [spool["id"] for spool in await db.default_database.list_spools()] == [created["id"]]


def test_the_module_has_no_function_that_the_database_does_not_have():
    with pytest.raises(AttributeError):
        db.no_such_function  # noqa: B018


async def test_a_route_reads_from_the_database_that_is_injected(client, monkeypatch, tmp_path):
    other = await create_database(tmp_path, "other.db")
    await other.create_spool(SPOOL)
    override_provider(monkeypatch, provide_database, other)
    response = await client.get("/api/spools")
    assert [spool["brand"] for spool in response.json()] == ["eSUN"]
