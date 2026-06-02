import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, Form

from app.moonraker import moonraker

router = APIRouter(prefix="/api/files/chunks", tags=["chunks"])

log = logging.getLogger(__name__)

# Temp dir for in-progress uploads
_CHUNK_DIR = Path(tempfile.gettempdir()) / "printer_chunks"
_CHUNK_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_chunk(
    file: UploadFile,
    upload_id: str = Form(...),
    filename: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
) -> dict:
    if not filename.endswith(".gcode"):
        raise HTTPException(400, "Only .gcode files are allowed")
    if total_chunks < 1 or chunk_index < 0 or chunk_index >= total_chunks:
        raise HTTPException(400, "Invalid chunk parameters")

    upload_dir = _CHUNK_DIR / upload_id
    upload_dir.mkdir(exist_ok=True)

    chunk_path = upload_dir / f"chunk_{chunk_index:04d}"
    content = await file.read()
    chunk_path.write_bytes(content)

    log.info("chunk %d/%d for %s (upload_id=%s)", chunk_index + 1, total_chunks, filename, upload_id)

    # Check if all chunks are present
    received = sorted(upload_dir.glob("chunk_*"))
    if len(received) < total_chunks:
        return {"status": "partial", "received": len(received), "total": total_chunks}

    # All chunks present — reassemble
    try:
        complete = bytearray()
        for chunk_file in received:
            complete.extend(chunk_file.read_bytes())

        result = await moonraker.upload_file(filename, bytes(complete))
        log.info("assembled and uploaded %s (%d bytes)", filename, len(complete))
        return {"status": "complete", "filename": filename, "result": result}
    except Exception as exc:
        raise HTTPException(502, f"Assembly/upload failed: {exc}") from exc
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


@router.delete("/cancel/{upload_id}")
async def cancel_upload(upload_id: str) -> dict:
    upload_dir = _CHUNK_DIR / upload_id
    shutil.rmtree(upload_dir, ignore_errors=True)
    return {"cancelled": upload_id}
