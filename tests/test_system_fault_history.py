from pathlib import Path
from typing import Any

import pytest

from app.db import Database

FAULT: dict[str, Any] = {
    "key": "host.under_voltage",
    "severity": "error",
    "source": "Host",
    "title": "Under-voltage",
    "detail": "",
}


@pytest.fixture
async def database(tmp_path: Path) -> Database:
    database = Database(str(tmp_path / "hoard.db"))
    await database.initialise()
    return database


async def test_a_new_fault_is_stored_as_active(database: Database):
    await database.record_system_faults([FAULT], now=100)
    [stored] = await database.list_system_faults()
    assert (stored["key"], stored["first_seen"], stored["last_seen"], stored["cleared_at"]) == (
        "host.under_voltage",
        100,
        100,
        None,
    )


async def test_a_fault_that_stays_is_one_row_with_a_later_last_seen(database: Database):
    await database.record_system_faults([FAULT], now=100)
    await database.record_system_faults([FAULT], now=130)
    [stored] = await database.list_system_faults()
    assert (stored["first_seen"], stored["last_seen"]) == (100, 130)


async def test_a_fault_that_is_gone_is_cleared(database: Database):
    await database.record_system_faults([FAULT], now=100)
    await database.record_system_faults([], now=160)
    [stored] = await database.list_system_faults()
    assert stored["cleared_at"] == 160


async def test_a_fault_that_comes_back_is_a_new_row_newest_first(database: Database):
    await database.record_system_faults([FAULT], now=100)
    await database.record_system_faults([], now=160)
    await database.record_system_faults([FAULT], now=200)
    newest, oldest = await database.list_system_faults()
    assert (newest["first_seen"], newest["cleared_at"]) == (200, None)
    assert (oldest["first_seen"], oldest["cleared_at"]) == (100, 160)


async def test_only_the_newest_faults_are_kept(database: Database):
    for moment in range(5):
        await database.record_system_faults([FAULT], now=moment * 10)
        await database.record_system_faults([], now=moment * 10 + 1)
    await database.prune_system_faults(keep=2)
    stored = await database.list_system_faults()
    assert [fault["first_seen"] for fault in stored] == [40, 30]


async def test_hidden_rows_are_saved_and_replaced(database: Database):
    assert await database.list_hidden_system_rows() == []
    await database.set_hidden_system_rows(["host.uptime", "fans"])
    assert sorted(await database.list_hidden_system_rows()) == ["fans", "host.uptime"]
    await database.set_hidden_system_rows(["motion"])
    assert await database.list_hidden_system_rows() == ["motion"]
