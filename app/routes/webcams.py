from collections.abc import AsyncIterator, Iterator
from contextlib import aclosing, contextmanager

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.mjpeg_relay import RELAY_CONTENT_TYPE, relay_latest_frames
from app.moonraker import MoonrakerClient
from app.moonraker_connection import CONNECT_TIMEOUT_SECONDS
from app.routes.dependencies import Moonraker, PrinterClientFactory

router = APIRouter(prefix="/api/webcams", tags=["webcams"])


@contextmanager
def _translate_webcam_errors() -> Iterator[None]:
    """An index outside the list is a 404, a printer or a camera that fails is a 502."""
    try:
        yield
    except IndexError:
        raise HTTPException(404, "Webcam not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


async def _resolved_cams(moonraker: MoonrakerClient) -> list[dict]:
    data = await moonraker.get("/server/webcams/list")
    cams = data.get("webcams", [])
    base = moonraker._client_base()
    for cam in cams:
        for field in ("stream_url", "snapshot_url"):
            url = cam.get(field, "")
            if url.startswith("/"):
                cam[field] = base + url
    return cams


async def _find_webcam_url(moonraker: MoonrakerClient, index: int, field: str, missing_message: str) -> str:
    url = (await _resolved_cams(moonraker))[index].get(field, "")
    if not url:
        raise HTTPException(404, missing_message)
    return url


def _proxy_paths(index: int) -> dict[str, str]:
    """Same-origin paths in place of the direct Moonraker URLs; the browser then never meets mixed content."""
    return {"snapshot_url": f"/api/webcams/{index}/snapshot", "stream_url": f"/api/webcams/{index}/stream"}


@router.get("")
async def list_webcams(moonraker: Moonraker):
    with _translate_webcam_errors():
        cams = await _resolved_cams(moonraker)
        return [{**cam, **_proxy_paths(index)} for index, cam in enumerate(cams)]


@router.get("/{index}/snapshot")
async def proxy_snapshot(index: int, moonraker: Moonraker, create_client: PrinterClientFactory):
    with _translate_webcam_errors():
        url = await _find_webcam_url(moonraker, index, "snapshot_url", "No snapshot URL configured for this webcam")
        async with create_client() as client:
            response = await client.get(url, timeout=10)
        return Response(
            content=response.content,
            media_type=response.headers.get("content-type", "image/jpeg"),
            headers={"Cache-Control": "no-store"},
        )


async def _relay_stream(client: httpx.AsyncClient, upstream: httpx.Response, request: Request) -> AsyncIterator[bytes]:
    try:
        # Whole frames, newest first: a slow client drops frames instead of seeing half of one.
        async with aclosing(relay_latest_frames(upstream.aiter_bytes(4096))) as parts:
            async for part in parts:
                if await request.is_disconnected():
                    break
                yield part
    finally:
        await upstream.aclose()
        await client.aclose()


@router.get("/{index}/stream")
async def proxy_stream(index: int, request: Request, moonraker: Moonraker, create_client: PrinterClientFactory):
    with _translate_webcam_errors():
        url = await _find_webcam_url(moonraker, index, "stream_url", "No stream URL configured for this webcam")
        client = create_client(timeout=httpx.Timeout(None, connect=CONNECT_TIMEOUT_SECONDS))
        upstream = await client.send(client.build_request("GET", url), stream=True)
        return StreamingResponse(_relay_stream(client, upstream, request), media_type=RELAY_CONTENT_TYPE)
