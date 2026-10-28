import httpx
from httpx import AsyncClient

from app.mjpeg_relay import RELAY_CONTENT_TYPE, format_part
from app.routes.dependencies import provide_http_client_factory
from tests.route_fakes import FakeMoonraker, install_fakes, override_provider

FRAME = b"\xff\xd8frame"


def moonraker_with_camera() -> FakeMoonraker:
    camera = {"stream_url": "http://camera.test/stream", "snapshot_url": "http://camera.test/snapshot"}
    return FakeMoonraker({"/server/webcams/list": {"webcams": [camera]}})


def camera_client_factory(responses: dict[str, httpx.Response]):
    def respond(request: httpx.Request) -> httpx.Response:
        return responses[request.url.path]

    return lambda **options: httpx.AsyncClient(transport=httpx.MockTransport(respond), **options)


async def test_a_snapshot_is_relayed_without_caching(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_camera())
    snapshot = httpx.Response(200, content=FRAME, headers={"content-type": "image/png"})
    override_provider(monkeypatch, provide_http_client_factory, camera_client_factory({"/snapshot": snapshot}))
    response = await client.get("/api/webcams/0/snapshot")
    assert (response.status_code, response.content) == (200, FRAME)
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"


async def test_a_stream_is_relayed_as_whole_frames(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_camera())
    upstream = b"--cam\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n%b\r\n" % (len(FRAME), FRAME)
    stream = httpx.Response(200, content=upstream)
    override_provider(monkeypatch, provide_http_client_factory, camera_client_factory({"/stream": stream}))
    response = await client.get("/api/webcams/0/stream")
    assert response.headers["content-type"] == RELAY_CONTENT_TYPE
    assert format_part(FRAME) in response.content
