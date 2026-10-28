from app.config import Settings


def test_unrelated_values_in_the_env_file_are_ignored(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("MOONRAKER_URL=http://printer.local\nUNRELATED_TOOL_VALUE=1\n")
    settings = Settings(_env_file=str(env_file))
    assert settings.moonraker_url == "http://printer.local"
