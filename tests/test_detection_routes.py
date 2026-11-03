from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.config import settings
from app.db import default_database
from app.main import app
from app.routes.detection import provide_event_hub


class FakeHub:
    def __init__(self, last: dict[str, Any] | None = None) -> None:
        self.last = last or {}

    def last_value(self, kind: str) -> dict[str, Any]:
        return self.last if kind == "detection" else {}


@pytest.fixture
def hub(monkeypatch: pytest.MonkeyPatch) -> FakeHub:
    fake = FakeHub()
    monkeypatch.setitem(app.dependency_overrides, provide_event_hub, lambda: fake)
    return fake


async def add_alert(score: float = 0.8, verdict: str | None = None, has_frame: bool = False) -> int:
    alert_id = await default_database.add_detection_alert(1000, "benchy.gcode", score, [])
    if verdict:
        await default_database.set_detection_verdicts([alert_id], verdict)
    if has_frame:
        frames = Path(settings.uploads_dir) / "detections"
        frames.mkdir(parents=True, exist_ok=True)
        (frames / f"{alert_id}.jpg").write_bytes(b"jpeg-bytes")
        await default_database.mark_detection_alert_has_frame(alert_id)
    return alert_id


async def test_without_a_detector_the_status_is_off(client: AsyncClient, hub: FakeHub, monkeypatch):
    monkeypatch.setattr(settings, "detector_url", "")
    body = (await client.get("/api/detection")).json()
    assert (body["configured"], body["state"]) == (False, "off")


async def test_with_a_detector_the_status_is_what_the_watcher_announced(client: AsyncClient, hub: FakeHub, monkeypatch):
    monkeypatch.setattr(settings, "detector_url", "http://detector:3333")
    hub.last = {"state": "watching", "score": 0.2}
    body = (await client.get("/api/detection")).json()
    assert (body["configured"], body["state"], body["score"]) == (True, "watching", 0.2)


async def test_the_status_never_shows_the_detector_address(client: AsyncClient, hub: FakeHub, monkeypatch):
    monkeypatch.setattr(settings, "detector_url", "http://detector:3333")
    assert "detector:3333" not in (await client.get("/api/detection")).text


async def test_the_settings_start_as_the_defaults(client: AsyncClient, hub: FakeHub):
    body = (await client.get("/api/detection/settings")).json()
    assert (body["threshold"], body["action"], body["enabled"]) == (0.5, "notify", True)


async def test_changed_settings_are_kept_and_the_others_stay(client: AsyncClient, hub: FakeHub):
    response = await client.put("/api/detection/settings", json={"threshold": 0.7, "action": "pause"})
    assert response.status_code == 200
    body = (await client.get("/api/detection/settings")).json()
    assert (body["threshold"], body["action"], body["interval_seconds"]) == (0.7, "pause", 10)


async def test_settings_that_make_no_sense_are_refused_and_not_kept(client: AsyncClient, hub: FakeHub):
    response = await client.put("/api/detection/settings", json={"threshold": 3})
    assert response.status_code == 422
    assert (await client.get("/api/detection/settings")).json()["threshold"] == 0.5


async def test_alerts_list_with_the_address_of_their_frame(client: AsyncClient, hub: FakeHub):
    with_frame = await add_alert(has_frame=True)
    without_frame = await add_alert()
    alerts = {alert["id"]: alert for alert in (await client.get("/api/detection/alerts")).json()}
    assert alerts[with_frame]["frame_url"] == f"/api/detection/alerts/{with_frame}/frame"
    assert alerts[without_frame]["frame_url"] is None


async def test_alerts_can_be_listed_by_verdict(client: AsyncClient, hub: FakeHub):
    await add_alert(verdict="real")
    unlabelled = await add_alert()
    alerts = (await client.get("/api/detection/alerts", params={"verdict": "unlabelled"})).json()
    assert [alert["id"] for alert in alerts] == [unlabelled]


async def test_the_frame_of_an_alert_is_served_as_an_image(client: AsyncClient, hub: FakeHub):
    alert_id = await add_alert(has_frame=True)
    response = await client.get(f"/api/detection/alerts/{alert_id}/frame")
    assert (response.status_code, response.content, response.headers["content-type"]) == (
        200,
        b"jpeg-bytes",
        "image/jpeg",
    )


async def test_an_alert_without_a_frame_has_no_frame_to_serve(client: AsyncClient, hub: FakeHub):
    alert_id = await add_alert()
    assert (await client.get(f"/api/detection/alerts/{alert_id}/frame")).status_code == 404


async def test_several_alerts_get_a_verdict_at_once(client: AsyncClient, hub: FakeHub):
    first, second = await add_alert(), await add_alert()
    response = await client.post("/api/detection/alerts/verdicts", json={"ids": [first, second], "verdict": "real"})
    assert response.status_code == 200
    verdicts = {alert["id"]: alert["verdict"] for alert in (await client.get("/api/detection/alerts")).json()}
    assert verdicts == {first: "real", second: "real"}


@pytest.mark.parametrize("body", [{"ids": [1], "verdict": "maybe"}, {"ids": [], "verdict": "real"}])
async def test_a_verdict_that_makes_no_sense_is_refused(client: AsyncClient, hub: FakeHub, body):
    assert (await client.post("/api/detection/alerts/verdicts", json=body)).status_code == 422


async def test_the_status_suggests_a_threshold_from_the_verdicts(client: AsyncClient, hub: FakeHub):
    for score in (0.55, 0.6, 0.62):
        await add_alert(score=score, verdict="false_alarm")
    suggestion = (await client.get("/api/detection")).json()["suggestion"]
    assert suggestion["threshold"] == 0.64
