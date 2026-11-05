from pathlib import Path

import pytest

from app.auto_power_off import AutoPowerOffSettings, InvalidAutoPowerOffSettingsError, build_auto_power_off_settings
from app.db import Database


@pytest.fixture
async def database(tmp_path: Path) -> Database:
    database = Database(str(tmp_path / "hoard.db"))
    await database.initialise()
    return database


def test_nothing_stored_gives_30_minutes_and_on():
    assert build_auto_power_off_settings({}) == AutoPowerOffSettings(enabled=True, idle_minutes=30)


def test_stored_values_replace_the_defaults():
    built = build_auto_power_off_settings({"enabled": False, "idle_minutes": 10})
    assert (built.enabled, built.idle_minutes) == (False, 10)


def test_unknown_keys_are_ignored():
    assert build_auto_power_off_settings({"colour": "red"}) == AutoPowerOffSettings()


@pytest.mark.parametrize("minutes", [0, -5, 1441])
def test_an_idle_time_outside_a_minute_and_a_day_is_refused(minutes: int):
    with pytest.raises(InvalidAutoPowerOffSettingsError, match="between 1 minute and 24 hours"):
        build_auto_power_off_settings({"idle_minutes": minutes})


async def test_the_settings_are_kept_in_the_database(database: Database):
    assert await database.get_auto_power_off_settings() == {}
    await database.save_auto_power_off_settings({"enabled": False, "idle_minutes": 45})
    await database.save_auto_power_off_settings({"idle_minutes": 20})
    assert await database.get_auto_power_off_settings() == {"enabled": False, "idle_minutes": 20}
