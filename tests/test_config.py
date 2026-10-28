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
