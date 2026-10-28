import base64

import httpx
import pytest
from httpx import AsyncClient

from app.config import settings
from tests.route_fakes import FakeMoonraker, install_fakes

PNG = b"\x89PNG\r\n\x1a\nfake-png"
JPEG = b"\xff\xd8\xfffake-jpeg"
CLOSED_ADDRESS = "http://127.0.0.1:1"
TRIANGLE = b"solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid t\n"


@pytest.fixture(autouse=True)
async def an_empty_thumbnail_cache(client: AsyncClient):
    await client.delete("/api/files/thumbnail/cache")


def inline_thumbnail(data: bytes, width: int = 300, height: int = 300) -> dict:
    return {"width": width, "height": height, "data": base64.b64encode(data).decode()}


def gcode_with_thumbnail(data: bytes) -> bytes:
    return b"; thumbnail begin 300x300 100\n; " + base64.b64encode(data) + b"\n; thumbnail end\nG28\n"


def status_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "http://printer.test/x")
    return httpx.HTTPStatusError("failed", request=request, response=httpx.Response(status, request=request))


async def test_the_files_are_listed_newest_first_with_a_filename(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.files = [
        {"path": "old.gcode", "modified": 1},
        {"path": "new.gcode", "filename": "kept.gcode", "modified": 5},
        {"path": "none.gcode"},
    ]
    install_fakes(monkeypatch, moonraker=moonraker)
    body = (await client.get("/api/files")).json()
    assert [item["filename"] for item in body] == ["kept.gcode", "old.gcode", "none.gcode"]


async def test_the_files_say_502_when_the_printer_fails(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("boom")
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/files")
    assert (response.status_code, response.json()["detail"]) == (502, "Moonraker error: boom")


async def test_the_metadata_of_a_file_is_passed_on_or_a_502(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"layer_count": 7}
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/files/metadata?filename=a.gcode")).json() == {"layer_count": 7}
    moonraker.failure = RuntimeError("boom")
    response = await client.get("/api/files/metadata?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (502, "Moonraker error: boom")


async def test_the_biggest_inline_thumbnail_is_served_and_cached(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": [inline_thumbnail(b"small", 32, 32), inline_thumbnail(PNG)]}
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (response.status_code, response.content) == (200, PNG)
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "public, max-age=3600"
    moonraker.failure = RuntimeError("down")
    assert (await client.get("/api/files/thumbnail?filename=a.gcode")).content == PNG


async def test_a_file_without_thumbnails_is_a_cached_404(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": []}
    install_fakes(monkeypatch, moonraker=moonraker)
    first = await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (first.status_code, first.json()["detail"]) == (404, "No thumbnails")
    moonraker.metadata = {"thumbnails": [inline_thumbnail(PNG)]}
    assert (await client.get("/api/files/thumbnail?filename=a.gcode")).status_code == 404


async def test_a_thumbnail_without_data_or_path_is_a_404(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": [{"width": 1, "height": 1}]}
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (404, "No thumbnail path or data")


async def test_a_thumbnail_file_that_cannot_be_fetched_is_a_404(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": [{"width": 1, "height": 1, "relative_path": ".thumbs/a.png"}]}
    install_fakes(monkeypatch, moonraker=moonraker)
    monkeypatch.setattr(settings, "moonraker_url", CLOSED_ADDRESS)
    response = await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (404, "Thumbnail file not found: .thumbs/a.png")


async def test_a_thumbnail_error_of_the_printer_is_a_502(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("boom")
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (502, "Thumbnail error: boom")


async def test_clearing_the_thumbnail_cache_for_one_file_or_all(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": [inline_thumbnail(PNG)]}
    install_fakes(monkeypatch, moonraker=moonraker)
    await client.get("/api/files/thumbnail?filename=a.gcode")
    assert (await client.delete("/api/files/thumbnail/cache?filename=a.gcode")).json() == {"cleared": "a.gcode"}
    assert (await client.delete("/api/files/thumbnail/cache")).json() == {"cleared": "all"}


async def test_the_gcode_thumbnail_prefers_the_metadata_of_the_printer(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.metadata = {"thumbnails": [inline_thumbnail(JPEG)]}
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (response.status_code, response.content) == (200, JPEG)
    assert response.headers["content-type"] == "image/jpeg"
    assert moonraker.downloads == []


async def test_the_gcode_thumbnail_falls_back_to_the_comments_in_the_gcode(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.gcode = gcode_with_thumbnail(PNG)
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (response.status_code, response.content) == (200, PNG)
    assert response.headers["content-type"] == "image/png"
    assert moonraker.downloads == ["a.gcode"]


async def test_the_gcode_thumbnail_without_any_source_is_a_cached_404(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.gcode = b"G28\n"
    install_fakes(monkeypatch, moonraker=moonraker)
    first = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (first.status_code, first.json()["detail"]) == (404, "No thumbnail available")
    moonraker.gcode = gcode_with_thumbnail(PNG)
    assert (await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")).status_code == 404


async def test_the_gcode_thumbnail_of_a_file_the_printer_does_not_have_is_a_404(client: AsyncClient, monkeypatch):
    class MissingFile(FakeMoonraker):
        async def download_file_partial(self, filename, size=131072):
            raise status_error(404)

    install_fakes(monkeypatch, moonraker=MissingFile())
    response = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (404, "File not found on printer")


async def test_the_gcode_thumbnail_passes_on_another_status_of_the_printer_as_502(client: AsyncClient, monkeypatch):
    class Broken(FakeMoonraker):
        async def download_file_partial(self, filename, size=131072):
            raise status_error(500)

    install_fakes(monkeypatch, moonraker=Broken())
    response = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (502, "Moonraker error 500")


async def test_the_gcode_thumbnail_is_a_404_when_the_printer_cannot_be_reached(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker())
    response = await client.get("/api/files/thumbnail/from-gcode?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (404, "No thumbnail available")


async def test_injecting_a_thumbnail_uploads_the_changed_gcode(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.gcode = b"G28\n"
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post(
        "/api/files/thumbnail/inject",
        files={"stl_file": ("t.stl", TRIANGLE, "model/stl")},
        data={"gcode_filename": "a.gcode"},
    )
    assert (response.status_code, response.json()) == (200, {"status": "ok", "filename": "a.gcode"})
    name, content = moonraker.uploaded[0]
    assert name == "a.gcode"
    assert content.startswith(b"; thumbnail begin") and content.endswith(b"G28\n")


async def test_injecting_fails_with_502_without_the_gcode_and_422_for_a_broken_stl(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    data = {"gcode_filename": "a.gcode"}
    missing = await client.post("/api/files/thumbnail/inject", files={"stl_file": ("t.stl", TRIANGLE)}, data=data)
    assert (missing.status_code, missing.json()["detail"].startswith("Could not download gcode")) == (502, True)
    moonraker.gcode = b"G28\n"
    broken = await client.post("/api/files/thumbnail/inject", files={"stl_file": ("t.stl", b"nonsense")}, data=data)
    assert (broken.status_code, broken.json()["detail"].startswith("STL render failed")) == (422, True)


async def test_injecting_fails_with_502_when_the_upload_fails(client: AsyncClient, monkeypatch):
    class RejectsUploads(FakeMoonraker):
        async def upload_file(self, filename, content):
            raise RuntimeError("full")

    moonraker = RejectsUploads()
    moonraker.gcode = b"G28\n"
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post(
        "/api/files/thumbnail/inject", files={"stl_file": ("t.stl", TRIANGLE)}, data={"gcode_filename": "a.gcode"}
    )
    assert (response.status_code, response.json()["detail"]) == (502, "Re-upload failed: full")


async def test_a_file_is_uploaded_to_the_printer(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/files/upload", files={"file": ("a.gcode", b"G28", "text/plain")})
    assert (response.status_code, response.json()) == (201, {"item": {"path": "a.gcode"}})
    assert moonraker.uploaded == [("a.gcode", b"G28")]


async def test_an_upload_the_printer_refuses_is_a_502(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("no space")
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/files/upload", files={"file": ("a.gcode", b"G28")})
    assert (response.status_code, response.json()["detail"]) == (502, "Moonraker upload error: no space")
