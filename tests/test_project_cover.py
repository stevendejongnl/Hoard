from pathlib import Path

from httpx import AsyncClient

from app.config import settings
from app.main import app
from app.mcp.catalog import build_tool_definitions
from tests.route_fakes import FakeMoonraker, install_fakes

PNG = b"\x89PNG\r\n\x1a\n-first banner"
OTHER_PNG = b"\x89PNG\r\n\x1a\n-second banner"


async def create_project(client: AsyncClient) -> int:
    return (await client.post("/api/projects", json={"name": "Desk pocket"})).json()["id"]


def printer_with(content: bytes | None) -> FakeMoonraker:
    printer = FakeMoonraker()
    printer.gcode = content
    return printer


def stored_covers() -> list[str]:
    return sorted(path.name for path in Path(settings.uploads_dir).glob("cover_*"))


async def test_a_cover_from_a_printer_image_is_copied_and_served_by_the_project(client: AsyncClient, monkeypatch):
    printer = printer_with(PNG)
    install_fakes(monkeypatch, moonraker=printer)
    project_id = await create_project(client)
    response = await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    assert response.status_code == 200
    assert response.json()["cover_url"].startswith(f"/api/projects/{project_id}/cover?v=")
    assert response.json()["cover_link_id"] is None
    assert printer.downloads == ["banner.png"]
    served = await client.get(f"/api/projects/{project_id}/cover")
    assert (served.status_code, served.content, served.headers["content-type"]) == (200, PNG, "image/png")


async def test_the_cover_of_the_project_is_the_one_the_project_lists(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(PNG))
    project_id = await create_project(client)
    await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    listed = (await client.get("/api/projects")).json()
    assert listed[0]["cover_url"].startswith(f"/api/projects/{project_id}/cover?v=")


async def test_a_cover_from_an_address_is_kept_as_it_is_and_the_project_serves_nothing(
    client: AsyncClient, monkeypatch
):
    install_fakes(monkeypatch, moonraker=printer_with(None))
    project_id = await create_project(client)
    response = await client.put(f"/api/projects/{project_id}/cover", json={"url": "/api/photos/00036C/part.jpg"})
    assert response.json()["cover_url"] == "/api/photos/00036C/part.jpg"
    assert (await client.get(f"/api/projects/{project_id}/cover")).status_code == 404


async def test_a_new_cover_replaces_the_stored_one(client: AsyncClient, monkeypatch):
    printer = printer_with(PNG)
    install_fakes(monkeypatch, moonraker=printer)
    project_id = await create_project(client)
    await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    printer.gcode = OTHER_PNG
    await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    assert len(stored_covers()) == 1
    assert (await client.get(f"/api/projects/{project_id}/cover")).content == OTHER_PNG


async def test_a_cover_from_an_address_removes_the_stored_image(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(PNG))
    project_id = await create_project(client)
    await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    assert len(stored_covers()) == 1
    await client.put(f"/api/projects/{project_id}/cover", json={"url": "https://example.test/photo.jpg"})
    assert stored_covers() == []


async def test_clearing_the_cover_removes_the_address_and_the_stored_image(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(PNG))
    project_id = await create_project(client)
    await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    response = await client.delete(f"/api/projects/{project_id}/cover")
    assert response.status_code == 204
    assert (await client.get(f"/api/projects/{project_id}")).json()["cover_url"] is None
    assert stored_covers() == []
    assert (await client.get(f"/api/projects/{project_id}/cover")).status_code == 404


async def test_a_cover_needs_a_filename_or_an_address_but_not_both(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(PNG))
    project_id = await create_project(client)
    for body in ({}, {"filename": "a.png", "url": "https://example.test/a.png"}):
        response = await client.put(f"/api/projects/{project_id}/cover", json=body)
        assert response.status_code == 422


async def test_only_an_image_can_be_a_cover(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(b"G28"))
    project_id = await create_project(client)
    response = await client.put(f"/api/projects/{project_id}/cover", json={"filename": "part.gcode"})
    assert (response.status_code, response.json()["detail"]) == (
        400,
        "A cover must be a png, jpg, jpeg, webp or gif image",
    )


async def test_a_cover_image_the_printer_cannot_give_is_a_502(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(None))
    project_id = await create_project(client)
    response = await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    assert response.status_code == 502
    assert stored_covers() == []


async def test_the_cover_of_an_unknown_project_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(PNG))
    assert (await client.put("/api/projects/99/cover", json={"url": "https://example.test/a.png"})).status_code == 404
    assert (await client.delete("/api/projects/99/cover")).status_code == 404


async def test_a_printer_file_can_be_imported_into_a_project_and_downloaded_again(client: AsyncClient, monkeypatch):
    printer = printer_with(b"3mf contents")
    install_fakes(monkeypatch, moonraker=printer)
    project_id = await create_project(client)
    response = await client.post(
        f"/api/projects/{project_id}/files/import", json={"filename": "part.3mf", "label": "Source"}
    )
    assert response.status_code == 201
    body = response.json()
    assert (body["type"], body["label"]) == ("3mf", "Source")
    downloaded = await client.get(f"/api/projects/{project_id}/files/{body['id']}/download")
    assert (downloaded.status_code, downloaded.content) == (200, b"3mf contents")
    assert printer.downloads == ["part.3mf"]


async def test_a_gcode_file_is_not_imported_because_it_stays_on_the_printer(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(b"G28"))
    project_id = await create_project(client)
    response = await client.post(f"/api/projects/{project_id}/files/import", json={"filename": "part.gcode"})
    assert (response.status_code, response.json()["detail"]) == (
        400,
        "A gcode file stays on the printer: add it to the project with add_file",
    )


async def test_importing_a_file_the_printer_cannot_give_is_a_502_and_an_unknown_project_a_404(
    client: AsyncClient, monkeypatch
):
    install_fakes(monkeypatch, moonraker=printer_with(None))
    project_id = await create_project(client)
    assert (
        await client.post(f"/api/projects/{project_id}/files/import", json={"filename": "a.3mf"})
    ).status_code == 502
    assert (await client.post("/api/projects/99/files/import", json={"filename": "a.3mf"})).status_code == 404


def test_the_mcp_can_set_and_clear_a_cover_and_import_a_file_but_the_image_itself_is_no_tool() -> None:
    names = {tool.name for tool in build_tool_definitions(app.openapi())}
    assert {"set_project_cover", "clear_project_cover", "import_printer_file"} <= names
    assert "serve_project_cover" not in names


async def test_deleting_a_project_removes_its_stored_cover(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_with(PNG))
    project_id = await create_project(client)
    await client.put(f"/api/projects/{project_id}/cover", json={"filename": "banner.png"})
    assert len(stored_covers()) == 1
    await client.delete(f"/api/projects/{project_id}")
    assert stored_covers() == []
