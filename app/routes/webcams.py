from contextlib import aclosing

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.mjpeg_relay import RELAY_CONTENT_TYPE, relay_latest_frames
from app.moonraker import moonraker
from app.moonraker_connection import CONNECT_TIMEOUT_SECONDS

router = APIRouter(prefix="/api/webcams", tags=["webcams"])


async def _resolved_cams() -> list[dict]:
    data = await moonraker.get("/server/webcams/list")
    cams = data.get("webcams", [])
    base = moonraker._client_base()
    for cam in cams:
        for field in ("stream_url", "snapshot_url"):
            url = cam.get(field, "")
            if url.startswith("/"):
                cam[field] = base + url
    return cams


@router.get("")
async def list_webcams():
    try:
        cams = await _resolved_cams()
        # Replace direct Moonraker URLs with proxied paths — the browser then only
        # ever loads same-origin HTTPS URLs, avoiding mixed-content blocks.
        result = []
        for i, cam in enumerate(cams):
            result.append(
                {
                    **cam,
                    "snapshot_url": f"/api/webcams/{i}/snapshot",
                    "stream_url": f"/api/webcams/{i}/stream",
                }
            )
        return result
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{index}/snapshot")
async def proxy_snapshot(index: int):
    try:
        cams = await _resolved_cams()
        cam = cams[index]
        url = cam.get("snapshot_url", "")
        if not url:
            raise HTTPException(404, "No snapshot URL configured for this webcam")
        async with moonraker.http_client() as client:
            r = await client.get(url, timeout=10)
        return Response(
            content=r.content,
            media_type=r.headers.get("content-type", "image/jpeg"),
            headers={"Cache-Control": "no-store"},
        )
    except IndexError:
        raise HTTPException(404, "Webcam not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{index}/stream")
async def proxy_stream(index: int, request: Request):
    try:
        cams = await _resolved_cams()
        cam = cams[index]
        url = cam.get("stream_url", "")
        if not url:
            raise HTTPException(404, "No stream URL configured for this webcam")

        client = moonraker.http_client(timeout=httpx.Timeout(None, connect=CONNECT_TIMEOUT_SECONDS))
        req = client.build_request("GET", url)
        r = await client.send(req, stream=True)

        async def generate():
            try:
                # Whole frames, newest first: a slow client drops frames instead of seeing half of one.
                async with aclosing(relay_latest_frames(r.aiter_bytes(4096))) as parts:
                    async for part in parts:
                        if await request.is_disconnected():
                            break
                        yield part
            finally:
                await r.aclose()
                await client.aclose()

        return StreamingResponse(generate(), media_type=RELAY_CONTENT_TYPE)
    except IndexError:
        raise HTTPException(404, "Webcam not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
