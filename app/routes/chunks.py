import logging
import re
import shutil
import tempfile
from pathlib import Path, PurePosixPath

from fastapi import APIRouter, Form, HTTPException, UploadFile

from app.moonraker import MoonrakerClient
from app.routes.dependencies import Moonraker

router = APIRouter(prefix="/api/files/chunks", tags=["chunks"])

log = logging.getLogger(__name__)

_CHUNK_DIR = Path(tempfile.gettempdir()) / "printer_chunks"
_CHUNK_DIR.mkdir(exist_ok=True)

_UPLOAD_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

MAX_CHUNKS = 50  # 50 × 50 MB = 2.5 GB ceiling
MAX_CHUNK_BYTES = 55 * 1024 * 1024  # 55 MB — 50 MB client chunk + HTTP overhead


def _safe_upload_dir(upload_id: str) -> Path:
    if not _UPLOAD_ID_RE.fullmatch(upload_id):
        raise HTTPException(400, "Invalid upload_id")
    upload_dir = (_CHUNK_DIR / upload_id).resolve()
    if _CHUNK_DIR.resolve() not in upload_dir.parents:
        raise HTTPException(400, "Invalid upload_id")
    return upload_dir


def _safe_filename(filename: str) -> str:
    safe = PurePosixPath(filename).name
    if safe != filename or "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, "Invalid filename")
    if not safe.endswith(".gcode"):
        raise HTTPException(400, "Only .gcode files are allowed")
    return safe


def _check_chunk_position(chunk_index: int, total_chunks: int) -> None:
    if total_chunks < 1 or total_chunks > MAX_CHUNKS:
        raise HTTPException(400, f"total_chunks must be 1–{MAX_CHUNKS}")
    if chunk_index < 0 or chunk_index >= total_chunks:
        raise HTTPException(400, "chunk_index out of range")


async def _store_chunk(file: UploadFile, upload_dir: Path, chunk_index: int) -> int:
    """Write a chunk into the upload folder; the size cap is enforced before anything is written."""
    content = await file.read(MAX_CHUNK_BYTES + 1)
    if len(content) > MAX_CHUNK_BYTES:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(413, f"Chunk exceeds {MAX_CHUNK_BYTES // 1024 // 1024} MB limit")
    (upload_dir / f"chunk_{chunk_index:04d}").write_bytes(content)
    return len(content)


def _assemble_chunks(received: list[Path], target: Path) -> bytes:
    """Stream-assemble the chunks into one file and read it back."""
    with target.open("wb") as out:
        for chunk_file in received:
            with chunk_file.open("rb") as chunk:
                shutil.copyfileobj(chunk, out)
    return target.read_bytes()


async def _forward_assembled_upload(
    moonraker: MoonrakerClient, upload_dir: Path, received: list[Path], safe_name: str
) -> dict:
    try:
        assembled_bytes = _assemble_chunks(received, upload_dir / "_assembled")
        result = await moonraker.upload_file(safe_name, assembled_bytes)
        log.info("assembled and uploaded %s (%d bytes)", safe_name, len(assembled_bytes))
        return {"status": "complete", "filename": safe_name, "result": result}
    except Exception as exc:
        raise HTTPException(502, f"Assembly/upload failed: {exc}") from exc
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


@router.post("/upload")
async def upload_chunk(
    file: UploadFile,
    moonraker: Moonraker,
    upload_id: str = Form(...),
    filename: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
) -> dict:
    safe_name = _safe_filename(filename)
    _check_chunk_position(chunk_index, total_chunks)
    upload_dir = _safe_upload_dir(upload_id)
    upload_dir.mkdir(exist_ok=True)
    size = await _store_chunk(file, upload_dir, chunk_index)
    log.info("chunk %d/%d for %s (upload_id=%s, %d bytes)", chunk_index + 1, total_chunks, safe_name, upload_id, size)
    received = sorted(upload_dir.glob("chunk_*"))
    if len(received) < total_chunks:
        return {"status": "partial", "received": len(received), "total": total_chunks}
    return await _forward_assembled_upload(moonraker, upload_dir, received, safe_name)


@router.delete("/cancel/{upload_id}")
async def cancel_upload(upload_id: str) -> dict:
    upload_dir = _safe_upload_dir(upload_id)
    shutil.rmtree(upload_dir, ignore_errors=True)
    return {"cancelled": upload_id}
