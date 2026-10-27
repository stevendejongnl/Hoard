import json
import urllib.error
import urllib.request

import pytest

from frontend.parity.fixture_data import create_fixture_events, create_fixture_responses
from frontend.parity.mock_backend import start_mock_backend

REQUEST_TIMEOUT_SECONDS = 5


@pytest.fixture
def injected_backend():
    responses = {"/api/example": {"value": 1}}
    events = [("printer_state", {"state": "printing"}), ("temps", {"hotend_actual": 204.9})]
    server = start_mock_backend(responses, events)
    yield server
    server.shutdown()


@pytest.fixture
def fixture_backend():
    server = start_mock_backend(create_fixture_responses(), create_fixture_events())
    yield server
    server.shutdown()


def build_address(server, path: str) -> str:
    return f"http://127.0.0.1:{server.server_address[1]}{path}"


def fetch_json(server, path: str):
    with urllib.request.urlopen(build_address(server, path), timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read())


def read_event_names_and_data(server, event_count: int) -> list[tuple[str, dict]]:
    events = []
    with urllib.request.urlopen(build_address(server, "/stream"), timeout=REQUEST_TIMEOUT_SECONDS) as response:
        assert response.headers["Content-Type"].startswith("text/event-stream")
        while len(events) < event_count:
            name = response.readline().decode().strip().removeprefix("event: ")
            data = response.readline().decode().strip().removeprefix("data: ")
            response.readline()
            events.append((name, json.loads(data)))
    return events


def test_serves_the_injected_json_for_a_path(injected_backend):
    assert fetch_json(injected_backend, "/api/example") == {"value": 1}


def test_ignores_the_query_string_when_looking_up_a_path(injected_backend):
    assert fetch_json(injected_backend, "/api/example?limit=20&offset=0") == {"value": 1}


def test_answers_an_unknown_path_with_not_found(injected_backend):
    with pytest.raises(urllib.error.HTTPError) as error_information:
        fetch_json(injected_backend, "/api/unknown")
    assert error_information.value.code == 404


def test_streams_the_injected_events_in_server_sent_events_format(injected_backend):
    events = read_event_names_and_data(injected_backend, 2)
    assert events == [("printer_state", {"state": "printing"}), ("temps", {"hotend_actual": 204.9})]


def test_fixture_reports_a_development_version(fixture_backend):
    assert fetch_json(fixture_backend, "/api/version") == {"version": "dev"}


def test_fixture_spools_match_the_design(fixture_backend):
    spools = fetch_json(fixture_backend, "/api/spools")
    assert [spool["brand"] for spool in spools] == ["Sunlu", "eSUN", "Generic"]
    assert [spool["current_weight_g"] for spool in spools] == [840, 612, 310]
    assert [spool["active"] for spool in spools] == [1, 0, 0]


def test_fixture_history_has_twelve_of_twenty_records_with_the_design_first_record(fixture_backend):
    history = fetch_json(fixture_backend, "/api/history?limit=20&offset=0")
    assert history["total"] == 20
    assert len(history["records"]) == 12
    assert history["records"][0]["filename"] == "Piedistallo+per+lego+F1+2Posti.gcode"
    assert history["records"][0]["duration_s"] == 13080


def test_fixture_projects_match_the_design(fixture_backend):
    projects = fetch_json(fixture_backend, "/api/projects")
    assert [project["name"] for project in projects] == ["Dactyl Manuform", "Doorhandle", "Lego F1 stand", "Voron 2.4"]


def test_fixture_project_detail_has_two_prints_and_one_file_and_one_link(fixture_backend):
    project = fetch_json(fixture_backend, "/api/projects/1")
    assert project["name"] == "Dactyl Manuform"
    assert len(project["prints"]) == 2
    assert len(project["files"]) == 1
    assert len(project["links"]) == 1


def test_fixture_has_one_enabled_enclosure_camera(fixture_backend):
    webcams = fetch_json(fixture_backend, "/api/webcams")
    assert [(webcam["name"], webcam["enabled"], webcam["target_fps"]) for webcam in webcams] == [("Enclosure", True, 15)]


def test_fixture_stream_starts_with_the_printing_state_temperatures_power_and_pi_stats(fixture_backend):
    events = dict(read_event_names_and_data(fixture_backend, 4))
    assert events["printer_state"]["progress"] == 1.8
    assert events["temps"]["hotend_actual"] == 204.9
    assert events["power"]["watts"] == 109
    assert events["pi_stats"]["cpu_temp"] == 37.6
