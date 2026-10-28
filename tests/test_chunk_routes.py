import pytest
from httpx import AsyncClient

from app.routes import chunks
from tests.route_fakes import FakeMoonraker, install_fakes

UPLOAD_ID = "upload-0001"


def chunk_form(index: int, total: int, filename: str = "part.gcode", upload_id: str = UPLOAD_ID) -> dict:
    return {"upload_id": upload_id, "filename": filename, "chunk_index": str(index), "total_chunks": str(total)}


async def send_chunk(client: AsyncClient, content: bytes, **form) -> object:
    return await client.post("/api/files/chunks/upload", files={"file": ("blob", content)}, data=chunk_form(**form))


@pytest.fixture(autouse=True)
async def no_chunks_left_over(client: AsyncClient):
    yield
    await client.delete(f"/api/files/chunks/cancel/{UPLOAD_ID}")


async def test_a_partial_upload_reports_how_many_chunks_arrived(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker())
    response = await send_chunk(client, b"one", index=0, total=3)
    assert (response.status_code, response.json()) == (200, {"status": "partial", "received": 1, "total": 3})


async def test_the_last_chunk_assembles_the_file_in_order_and_sends_it_to_the_printer(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    await send_chunk(client, b"BBB", index=1, total=2)
    response = await send_chunk(client, b"AAA", index=0, total=2)
    assert response.json() == {
        "status": "complete",
        "filename": "part.gcode",
        "result": {"item": {"path": "part.gcode"}},
    }
    assert moonraker.uploaded == [("part.gcode", b"AAABBB")]
    assert not (chunks._CHUNK_DIR / UPLOAD_ID).exists()


async def test_a_failing_printer_is_a_502_and_the_chunks_are_removed(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("no space")
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await send_chunk(client, b"AAA", index=0, total=1)
    assert (response.status_code, response.json()["detail"]) == (502, "Assembly/upload failed: no space")
    assert not (chunks._CHUNK_DIR / UPLOAD_ID).exists()


@pytest.mark.parametrize("filename", ["../part.gcode", ".hidden.gcode", "a\\b.gcode", "dir/part.gcode"])
async def test_a_filename_with_a_path_or_a_leading_dot_is_a_400(client: AsyncClient, filename):
    response = await send_chunk(client, b"x", index=0, total=1, filename=filename)
    assert (response.status_code, response.json()["detail"]) == (400, "Invalid filename")


async def test_only_gcode_files_are_accepted(client: AsyncClient):
    response = await send_chunk(client, b"x", index=0, total=1, filename="part.stl")
    assert (response.status_code, response.json()["detail"]) == (400, "Only .gcode files are allowed")


@pytest.mark.parametrize("total", [0, 51])
async def test_the_number_of_chunks_must_be_between_one_and_fifty(client: AsyncClient, total):
    response = await send_chunk(client, b"x", index=0, total=total)
    assert (response.status_code, response.json()["detail"]) == (400, "total_chunks must be 1–50")


@pytest.mark.parametrize("index", [-1, 2])
async def test_the_chunk_index_must_be_inside_the_total(client: AsyncClient, index):
    response = await send_chunk(client, b"x", index=index, total=2)
    assert (response.status_code, response.json()["detail"]) == (400, "chunk_index out of range")


@pytest.mark.parametrize("upload_id", ["short", "has space in it", "x" * 65])
async def test_an_upload_id_of_the_wrong_shape_is_a_400(client: AsyncClient, upload_id):
    response = await send_chunk(client, b"x", index=0, total=2, upload_id=upload_id)
    assert (response.status_code, response.json()["detail"]) == (400, "Invalid upload_id")


async def test_an_oversized_chunk_is_a_413_and_removes_the_upload(client: AsyncClient):
    response = await send_chunk(client, b"x" * (chunks.MAX_CHUNK_BYTES + 1), index=0, total=2)
    assert response.status_code == 413
    assert not (chunks._CHUNK_DIR / UPLOAD_ID).exists()


async def test_cancelling_removes_the_received_chunks(client: AsyncClient):
    await send_chunk(client, b"x", index=0, total=2)
    response = await client.delete(f"/api/files/chunks/cancel/{UPLOAD_ID}")
    assert response.json() == {"cancelled": UPLOAD_ID}
    assert not (chunks._CHUNK_DIR / UPLOAD_ID).exists()


async def test_cancelling_with_an_invalid_id_is_a_400(client: AsyncClient):
    assert (await client.delete("/api/files/chunks/cancel/bad id!!")).status_code in (400, 404)
