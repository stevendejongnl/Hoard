from frontend.parity.detection_fixture import (
    DETECTION_SHOWCASE_SCREENS,
    create_detection_events,
    create_detection_responses,
)

ALERTS_PATH = "/api/detection/alerts"


def test_detection_is_configured_and_shows_an_alert() -> None:
    status = create_detection_responses()["/api/detection"]
    assert status["configured"] is True
    assert status["state"] == "alert"
    assert status["frames_leave_network"] is False


def test_exactly_one_alert_waits_for_an_answer() -> None:
    alerts = create_detection_responses()[ALERTS_PATH]
    assert [alert["verdict"] for alert in alerts].count(None) == 1
    assert len(alerts) >= 4


def test_every_alert_with_a_frame_has_that_frame_to_serve() -> None:
    responses = create_detection_responses()
    for alert in responses[ALERTS_PATH]:
        assert isinstance(responses[alert["frame_url"]], bytes)


def test_the_detection_event_tells_the_alert_state() -> None:
    assert ("detection", {"state": "alert", "score": 0.82}) in create_detection_events()


def test_the_screens_are_distinct_png_files() -> None:
    file_names = [screen.file_name for screen in DETECTION_SHOWCASE_SCREENS.values()]
    assert all(file_name.endswith(".png") for file_name in file_names)
    assert len(set(file_names)) == len(file_names)
