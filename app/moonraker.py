import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from typing import Any

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

from app.config import settings

log = logging.getLogger(__name__)

NotifyHandler = Callable[[list[Any]], Coroutine[Any, Any, None]]


class MoonrakerClient:
    def __init__(self) -> None:
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._handlers: dict[str, list[NotifyHandler]] = {}
        self._running = False
        self._req_id = 0

    def _client_base(self) -> str:
        return settings.moonraker_url

    # ── REST ──────────────────────────────────────────────────────────────────

    async def get(self, path: str, **params: Any) -> Any:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{settings.moonraker_url}{path}",
                params=params or None,
                timeout=15,
            )
            r.raise_for_status()
            return r.json().get("result", r.json())

    async def post(self, path: str, **data: Any) -> Any:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{settings.moonraker_url}{path}",
                json=data or None,
                timeout=15,
            )
            r.raise_for_status()
            return r.json().get("result", r.json())

    async def upload_file(self, filename: str, content: bytes) -> Any:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{settings.moonraker_url}/server/files/upload",
                files={"file": (filename, content, "application/octet-stream")},
                timeout=300,
            )
            r.raise_for_status()
            return r.json()

    # ── Convenience REST wrappers ─────────────────────────────────────────────

    async def get_printer_objects(self) -> dict[str, Any]:
        return await self.get(
            "/printer/objects/query",
            print_stats="",
            extruder="",
            heater_bed="",
            toolhead="",
        )

    async def get_files(self) -> list[dict[str, Any]]:
        result = await self.get("/server/files/list", root="gcodes")
        return result if isinstance(result, list) else result.get("files", [])

    async def get_file_metadata(self, filename: str) -> dict[str, Any]:
        return await self.get("/server/files/metadata", filename=filename)

    async def download_file(self, filename: str) -> bytes:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{settings.moonraker_url}/server/files/gcodes/{filename}",
                timeout=300,
            )
            r.raise_for_status()
            return r.content

    async def get_history_job(self, job_id: str) -> dict[str, Any]:
        result = await self.get(f"/server/history/job", uid=job_id)
        return result.get("job", result)

    async def get_proc_stats(self) -> dict[str, Any]:
        return await self.get("/machine/proc_stats")

    # ── WebSocket ─────────────────────────────────────────────────────────────

    def on(self, method: str, handler: NotifyHandler) -> None:
        self._handlers.setdefault(method, []).append(handler)

    async def connect_ws(self) -> None:
        self._running = True
        while self._running:
            try:
                async with websockets.connect(settings.moonraker_ws, ping_interval=20) as ws:
                    self._ws = ws
                    log.info("Moonraker WS connected")
                    await self._subscribe(ws)
                    async for raw in ws:
                        await self._dispatch(raw)
            except ConnectionClosed:
                log.warning("Moonraker WS closed, reconnecting in 5s")
            except Exception as exc:
                log.warning("Moonraker WS error: %s, reconnecting in 5s", exc)
            finally:
                self._ws = None
            if self._running:
                await asyncio.sleep(5)

    def stop(self) -> None:
        self._running = False
        if self._ws:
            asyncio.create_task(self._ws.close())

    async def _subscribe(self, ws: websockets.WebSocketClientProtocol) -> None:
        self._req_id += 1
        await ws.send(json.dumps({
            "jsonrpc": "2.0",
            "method": "printer.objects.subscribe",
            "params": {
                "objects": {
                    "print_stats": None,
                    "display_status": None,
                    "motion_report": None,
                    "extruder": None,
                    "heater_bed": None,
                    "toolhead": None,
                }
            },
            "id": self._req_id,
        }))

    async def _dispatch(self, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return

        # Subscription result carries the initial full status — process it like a notification
        if "result" in msg and isinstance(msg.get("result"), dict):
            status = msg["result"].get("status")
            if status and isinstance(status, dict):
                for handler in self._handlers.get("notify_status_update", []):
                    try:
                        await handler([status])
                    except Exception as exc:
                        log.error("Handler initial_state error: %s", exc)
            return

        method = msg.get("method")
        if method and method in self._handlers:
            params = msg.get("params", [])
            for handler in self._handlers[method]:
                try:
                    await handler(params)
                except Exception as exc:
                    log.error("Handler %s error: %s", method, exc)


moonraker = MoonrakerClient()
