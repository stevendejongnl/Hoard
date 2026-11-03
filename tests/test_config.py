from app.config import Settings


def test_unrelated_values_in_the_env_file_are_ignored(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("MOONRAKER_URL=http://printer.local\nUNRELATED_TOOL_VALUE=1\n")
    settings = Settings(_env_file=str(env_file))
    assert settings.moonraker_url == "http://printer.local"


def test_uploads_go_to_a_folder_next_to_the_database_so_they_survive_a_restart(monkeypatch) -> None:
    monkeypatch.delenv("UPLOADS_DIR", raising=False)
    settings = Settings(_env_file=None, database_path="/data/hoard.db")
    assert settings.uploads_dir == "/data/uploads"


def test_the_folder_follows_the_database_of_a_deployment_that_keeps_the_old_file_name(monkeypatch) -> None:
    monkeypatch.delenv("UPLOADS_DIR", raising=False)
    settings = Settings(_env_file=None, database_path="/data/printer.db")
    assert settings.uploads_dir == "/data/uploads"


def test_an_explicit_uploads_folder_is_kept(monkeypatch) -> None:
    monkeypatch.delenv("UPLOADS_DIR", raising=False)
    settings = Settings(_env_file=None, database_path="/data/hoard.db", uploads_dir="/srv/files")
    assert settings.uploads_dir == "/srv/files"


def test_secrets_never_show_when_the_settings_are_printed() -> None:
    settings = Settings(
        _env_file=None,
        ha_token="ha-secret-value",
        influxdb_token="influx-secret-value",
        vapid_private_key="vapid-secret-value",
    )
    printed = repr(settings) + str(settings)
    for secret in ("ha-secret-value", "influx-secret-value", "vapid-secret-value"):
        assert secret not in printed


def test_detection_is_off_until_a_detector_address_is_set() -> None:
    settings = Settings(_env_file=None, detector_url="")
    assert settings.detector_url == ""


def test_the_detector_token_never_shows_when_the_settings_are_printed() -> None:
    settings = Settings(_env_file=None, detector_token="detector-secret")
    assert "detector-secret" not in repr(settings)


def test_the_detector_is_obico_unless_another_backend_is_chosen() -> None:
    assert Settings(_env_file=None).detector_backend == "obico"


def test_the_vision_key_never_shows_when_the_settings_are_printed() -> None:
    assert "vision-secret" not in repr(Settings(_env_file=None, vision_api_key="vision-secret"))


def test_a_borderline_band_sits_between_the_two_ends_by_default() -> None:
    settings = Settings(_env_file=None)
    assert 0 < settings.chained_low < settings.chained_high < 1
