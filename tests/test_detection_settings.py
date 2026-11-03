from pathlib import Path

import pytest

from app.db import Database
from app.detection_settings import DetectionSettings, InvalidDetectionSettingsError, build_detection_settings


@pytest.fixture
async def database(tmp_path: Path) -> Database:
    database = Database(str(tmp_path / "hoard.db"))
    await database.initialise()
    return database


def test_nothing_stored_gives_the_defaults():
    assert build_detection_settings({}) == DetectionSettings()


def test_the_default_action_only_notifies():
    assert DetectionSettings().action == "notify"


def test_stored_values_replace_the_defaults():
    built = build_detection_settings({"threshold": 0.7, "action": "pause"})
    assert (built.threshold, built.action, built.interval_seconds) == (0.7, "pause", 10)


def test_unknown_keys_are_ignored():
    assert build_detection_settings({"colour": "red"}) == DetectionSettings()


@pytest.mark.parametrize(
    "values",
    [
        {"threshold": 1.5},
        {"threshold": -0.1},
        {"interval_seconds": 0},
        {"window_size": 0},
        {"required_frames": 0},
        {"window_size": 3, "required_frames": 4},
        {"action": "cancel"},
    ],
)
def test_values_that_make_no_sense_are_refused(values):
    with pytest.raises(InvalidDetectionSettingsError):
        build_detection_settings(values)


async def test_nothing_saved_reads_back_empty(database: Database):
    assert await database.get_detection_settings() == {}


async def test_saved_settings_read_back(database: Database):
    await database.save_detection_settings({"threshold": 0.6, "enabled": False})
    assert await database.get_detection_settings() == {"threshold": 0.6, "enabled": False}


async def test_saving_again_replaces_a_value_and_keeps_the_others(database: Database):
    await database.save_detection_settings({"threshold": 0.6, "action": "pause"})
    await database.save_detection_settings({"threshold": 0.8})
    assert await database.get_detection_settings() == {"threshold": 0.8, "action": "pause"}
