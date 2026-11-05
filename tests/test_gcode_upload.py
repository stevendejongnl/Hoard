import httpx
import pytest
from httpx import AsyncClient

from app.main import app
from app.mcp.catalog import build_tool_definitions
from tests.route_fakes import FakeMoonraker, install_fakes

GCODE = "G28\nG1 X10 Y10 F3000\n"


async def upload(client: AsyncClient, monkeypatch, body: dict, moonraker: FakeMoonraker | None = None):
    moonraker = moonraker or FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    return await client.post("/api/files/gcode", json=body), moonraker


async def test_the_text_is_put_on_the_printer_under_the_name_that_was_given(client: AsyncClient, monkeypatch):
    response, moonraker = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": GCODE})
    assert (response.status_code, response.json()) == (201, {"filename": "plate.gcode", "size_bytes": len(GCODE)})
    assert moonraker.uploaded == [("plate.gcode", GCODE.encode())]


async def test_the_size_counts_bytes_not_characters(client: AsyncClient, monkeypatch):
    response, _ = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": "; °C\n"})
    assert response.json()["size_bytes"] == len("; °C\n".encode())


@pytest.mark.parametrize(
    "filename", ["../plate.gcode", ".hidden.gcode", "a\\b.gcode", "dir/plate.gcode", "plate.stl", ""]
)
async def test_a_name_that_is_not_a_plain_gcode_name_is_refused_in_one_sentence(
    client: AsyncClient, monkeypatch, filename
):
    response, moonraker = await upload(client, monkeypatch, {"filename": filename, "content": GCODE})
    assert response.status_code == 422
    assert response.json()["detail"] == "filename must be a plain name that ends in .gcode, without a folder."
    assert moonraker.uploaded == []


async def test_empty_content_is_refused(client: AsyncClient, monkeypatch):
    response, moonraker = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": "  \n"})
    assert (response.status_code, response.json()["detail"]) == (422, "content must not be empty.")
    assert moonraker.uploaded == []


async def test_text_over_two_megabytes_is_refused_and_points_to_the_dashboard(client: AsyncClient, monkeypatch):
    response, moonraker = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": "G1 X1\n" * 400_000})
    assert response.status_code == 422
    assert response.json()["detail"] == "content must be at most 2 MB as text; upload a larger file from the dashboard."
    assert moonraker.uploaded == []


async def test_a_printer_that_cannot_be_reached_is_explained(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = httpx.ConnectError("refused")
    response, _ = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": GCODE}, moonraker)
    assert (response.status_code, response.json()["detail"]) == (
        502,
        "Hoard cannot reach the printer. Is it switched on?",
    )


def test_an_mcp_client_gets_the_upload_as_a_tool_that_needs_no_approval():
    tools = {tool.name: tool for tool in build_tool_definitions(app.openapi())}
    tool = tools["upload_gcode"]
    assert (tool.method, tool.path, tool.required_scope) == ("POST", "/api/files/gcode", "control")
    assert not tool.needs_approval
    assert set(tool.body_property_names) == {"filename", "content"}
