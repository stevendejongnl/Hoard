from httpx import AsyncClient

from app.config import settings
from tests.route_fakes import FakeMoonraker, install_fakes

CLOSED_ADDRESS = "http://127.0.0.1:1"


def moonraker_with_webcams(*webcams: dict) -> FakeMoonraker:
    return FakeMoonraker({"/server/webcams/list": {"webcams": list(webcams)}})


async def test_the_webcams_are_listed_with_proxied_urls(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "moonraker_url", CLOSED_ADDRESS)
    camera = {"name": "nozzle", "stream_url": "/webcam/?action=stream", "snapshot_url": "/webcam/?action=snapshot"}
    install_fakes(monkeypatch, moonraker=moonraker_with_webcams(camera, {"name": "side"}))
    body = (await client.get("/api/webcams")).json()
    assert body == [
        {"name": "nozzle", "stream_url": "/api/webcams/0/stream", "snapshot_url": "/api/webcams/0/snapshot"},
        {"name": "side", "stream_url": "/api/webcams/1/stream", "snapshot_url": "/api/webcams/1/snapshot"},
    ]


async def test_the_webcam_list_is_a_502_when_the_printer_fails(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker({"/server/webcams/list": RuntimeError("down")}))
    response = await client.get("/api/webcams")
    assert (response.status_code, response.json()["detail"]) == (502, "down")


async def test_a_webcam_that_does_not_exist_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_webcams({"name": "a"}))
    assert (await client.get("/api/webcams/5/snapshot")).status_code == 404
    assert (await client.get("/api/webcams/5/stream")).status_code == 404


async def test_a_webcam_without_urls_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_webcams({"name": "a"}))
    snapshot = await client.get("/api/webcams/0/snapshot")
    stream = await client.get("/api/webcams/0/stream")
    assert (snapshot.status_code, snapshot.json()["detail"]) == (404, "No snapshot URL configured for this webcam")
    assert (stream.status_code, stream.json()["detail"]) == (404, "No stream URL configured for this webcam")


async def test_a_webcam_that_cannot_be_reached_is_a_502(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "moonraker_url", CLOSED_ADDRESS)
    camera = {"stream_url": "/s", "snapshot_url": "/p"}
    install_fakes(monkeypatch, moonraker=moonraker_with_webcams(camera))
    assert (await client.get("/api/webcams/0/snapshot")).status_code == 502
    assert (await client.get("/api/webcams/0/stream")).status_code == 502
