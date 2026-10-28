import pytest
from httpx import AsyncClient

from app.routes.dependencies import provide_http_client_factory
from app.routes.thumbnail_cache import CachedThumbnail, ThumbnailCache
from tests.route_fakes import FakeMoonraker, install_fakes, override_provider, printer_files_client_factory

PNG = b"\x89PNG\r\n\x1a\nfake-png"
JPEG = b"\xff\xd8\xfffake-jpeg"


@pytest.fixture(autouse=True)
async def an_empty_thumbnail_cache(client: AsyncClient):
    await client.delete("/api/files/thumbnail/cache")


def moonraker_with_thumbnail_path(relative_path: str) -> FakeMoonraker:
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": [{"width": 1, "height": 1, "relative_path": relative_path}]}
    return moonraker


async def test_a_thumbnail_file_of_the_printer_is_fetched_without_the_gcodes_prefix(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_thumbnail_path(".thumbs/a.jpg"))
    served = {"/server/files/.thumbs/a.jpg": (JPEG, "image/jpeg")}
    override_provider(monkeypatch, provide_http_client_factory, printer_files_client_factory(served))
    response = await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (response.status_code, response.content) == (200, JPEG)
    assert response.headers["content-type"] == "image/jpeg"


async def test_the_gcode_thumbnail_downloads_the_thumbnail_file_of_the_printer(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_thumbnail_path(".thumbs/a.png"))
    served = {"/server/files/gcodes/.thumbs/a.png": (PNG, "application/octet-stream")}
    override_provider(monkeypatch, provide_http_client_factory, printer_files_client_factory(served))
    response = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (response.status_code, response.content) == (200, PNG)
    assert response.headers["content-type"] == "image/png"


async def test_a_thumbnail_cache_forgets_what_is_older_than_an_hour():
    now = [0.0]
    cache = ThumbnailCache(clock=lambda: now[0])
    cache.store("a.gcode", PNG)
    cache.store("none.gcode", None)
    assert cache.find("a.gcode") == CachedThumbnail(PNG)
    assert cache.find("none.gcode") == CachedThumbnail(None)
    assert cache.find("other.gcode") is None
    now[0] = 3601.0
    assert cache.find("a.gcode") is None
