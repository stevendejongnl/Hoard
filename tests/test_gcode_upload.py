import hashlib

import httpx
import pytest
from httpx import AsyncClient

from app.main import app
from app.mcp.catalog import build_tool_definitions
from tests.route_fakes import FakeMoonraker, install_fakes

GCODE = "G28\nG1 X10 Y10 F3000\n"


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def upload(client: AsyncClient, monkeypatch, body: dict, moonraker: FakeMoonraker | None = None):
    moonraker = moonraker or FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    return await client.post("/api/files/gcode", json=body), moonraker


async def test_the_text_is_put_on_the_printer_under_the_name_that_was_given(client: AsyncClient, monkeypatch):
    response, moonraker = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": GCODE})
    assert (response.status_code, response.json()) == (
        201,
        {"filename": "plate.gcode", "size_bytes": len(GCODE), "sha256": fingerprint(GCODE)},
    )
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


def test_an_mcp_client_gets_the_upload_as_a_tool_that_needs_the_approval_of_a_person():
    tools = {tool.name: tool for tool in build_tool_definitions(app.openapi())}
    tool = tools["upload_gcode"]
    assert (tool.method, tool.path, tool.required_scope) == ("POST", "/api/files/gcode", "control")
    assert tool.needs_approval
    assert set(tool.body_property_names) == {"filename", "content", "expected_sha256"}
    assert "expected_sha256" not in tool.input_schema["required"]


async def test_the_fingerprint_covers_the_bytes_and_not_the_characters(client: AsyncClient, monkeypatch):
    response, _ = await upload(client, monkeypatch, {"filename": "plate.gcode", "content": "; °C\n"})
    assert response.json()["sha256"] == fingerprint("; °C\n")


@pytest.mark.parametrize("write", [str.lower, str.upper])
async def test_text_that_matches_the_expected_fingerprint_is_uploaded(client: AsyncClient, monkeypatch, write):
    body = {"filename": "plate.gcode", "content": GCODE, "expected_sha256": write(fingerprint(GCODE))}
    response, moonraker = await upload(client, monkeypatch, body)
    assert response.status_code == 201
    assert moonraker.uploaded == [("plate.gcode", GCODE.encode())]


async def test_text_with_one_changed_digit_is_not_uploaded_and_both_fingerprints_are_named(
    client: AsyncClient, monkeypatch
):
    original = "G1 X10 Y86.301 E1\n"
    retyped = "G1 X10 Y86.801 E1\n"
    body = {"filename": "plate.gcode", "content": retyped, "expected_sha256": fingerprint(original)}
    response, moonraker = await upload(client, monkeypatch, body)
    assert response.status_code == 422
    assert response.json()["detail"] == (
        f"The text arrived with SHA-256 {fingerprint(retyped)}, not {fingerprint(original)}. "
        "Nothing was uploaded: send it again."
    )
    assert moonraker.uploaded == []


@pytest.mark.parametrize("expected", ["abc", "g" * 64, fingerprint(GCODE) + "0", ""])
async def test_an_expected_fingerprint_that_is_not_64_hexadecimal_characters_is_refused(
    client: AsyncClient, monkeypatch, expected
):
    body = {"filename": "plate.gcode", "content": GCODE, "expected_sha256": expected}
    response, moonraker = await upload(client, monkeypatch, body)
    assert response.status_code == 422
    assert response.json()["detail"] == "expected_sha256 must be 64 hexadecimal characters."
    assert moonraker.uploaded == []
