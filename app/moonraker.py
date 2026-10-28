import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from typing import Any

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

from app.config import settings
from app.moonraker_connection import CONNECT_TIMEOUT_SECONDS, ConnectionBreaker, GuardedTransport

log = logging.getLogger(__name__)

NotifyHandler = Callable[[list[Any]], Coroutine[Any, Any, None]]

DEFAULT_TIMEOUT = httpx.Timeout(5, connect=CONNECT_TIMEOUT_SECONDS)
REQUEST_TIMEOUT = httpx.Timeout(15, connect=CONNECT_TIMEOUT_SECONDS)
TRANSFER_TIMEOUT = httpx.Timeout(300, connect=CONNECT_TIMEOUT_SECONDS)


class MoonrakerClient:
    def __init__(self, breaker: ConnectionBreaker | None = None) -> None:
        self._ws: websockets.ClientConnection | None = None
        self._handlers: dict[str, list[NotifyHandler]] = {}
        self._running = False
        self._req_id = 0
        self._last_msg_at: float = 0.0
        self.breaker = breaker or ConnectionBreaker()

    def http_client(self, timeout: httpx.Timeout = DEFAULT_TIMEOUT) -> httpx.AsyncClient:
        """A client for the printer's host: it fails at once while the printer is known to be off."""
        return httpx.AsyncClient(transport=GuardedTransport(self.breaker), timeout=timeout)

    def _client_base(self) -> str:
        return settings.moonraker_url

    # ── REST ──────────────────────────────────────────────────────────────────

    async def get(self, path: str, **params: Any) -> Any:
        async with self.http_client() as client:
            r = await client.get(
                f"{settings.moonraker_url}{path}",
                params=params or None,
                timeout=REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            return r.json().get("result", r.json())

    async def post(self, path: str, **data: Any) -> Any:
        async with self.http_client() as client:
            r = await client.post(
                f"{settings.moonraker_url}{path}",
                json=data or None,
                timeout=REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            return r.json().get("result", r.json())

    async def upload_file(self, filename: str, content: bytes) -> Any:
        async with self.http_client() as client:
            r = await client.post(
                f"{settings.moonraker_url}/server/files/upload",
                files={"file": (filename, content, "application/octet-stream")},
                timeout=TRANSFER_TIMEOUT,
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
        async with self.http_client() as client:
            r = await client.get(
                f"{settings.moonraker_url}/server/files/gcodes/{filename}",
                timeout=TRANSFER_TIMEOUT,
            )
            r.raise_for_status()
            return r.content

    async def download_file_partial(self, filename: str, size: int = 131072) -> bytes:
        """Fetch only the first `size` bytes via HTTP Range — fast for thumbnail extraction."""
        async with self.http_client() as client:
            r = await client.get(
                f"{settings.moonraker_url}/server/files/gcodes/{filename}",
                headers={"Range": f"bytes=0-{size - 1}"},
                timeout=REQUEST_TIMEOUT,
            )
            # 206 Partial Content or 200 OK both acceptable
            if r.status_code not in (200, 206):
                r.raise_for_status()
            return r.content

    async def get_history_job(self, job_id: str) -> dict[str, Any]:
        result = await self.get("/server/history/job", uid=job_id)
        return result.get("job", result)

    async def get_proc_stats(self) -> dict[str, Any]:
        return await self.get("/machine/proc_stats")

    # ── WebSocket ─────────────────────────────────────────────────────────────

    def on(self, method: str, handler: NotifyHandler) -> None:
        self._handlers.setdefault(method, []).append(handler)

    async def _seed_initial_state(self) -> None:
        await asyncio.sleep(2)
        try:
            result = await self.get(
                "/printer/objects/query",
                print_stats="",
                display_status="",
                motion_report="",
                extruder="",
                heater_bed="",
            )
            status = result.get("status", {})
            if status:
                for handler in self._handlers.get("notify_status_update", []):
                    await handler([status])
        except Exception as exc:
            log.warning("Initial state seed error: %s", exc)

    async def connect_ws(self) -> None:
        self._running = True
        while self._running:
            try:
                async with websockets.connect(
                    settings.moonraker_ws,
                    ping_interval=20,
                    ping_timeout=30,
                ) as ws:
                    self._ws = ws
                    self._last_msg_at = asyncio.get_event_loop().time()
                    log.info("Moonraker WS connected")
                    await self._subscribe(ws)
                    asyncio.create_task(self._seed_initial_state())
                    asyncio.create_task(self._watchdog(ws))
                    async for raw in ws:
                        self._last_msg_at = asyncio.get_event_loop().time()
                        if isinstance(raw, str):
                            await self._dispatch(raw)
            except ConnectionClosed:
                log.warning("Moonraker WS closed, reconnecting in 5s")
            except Exception as exc:
                log.warning("Moonraker WS error: %s, reconnecting in 5s", exc)
            finally:
                self._ws = None
            if self._running:
                await asyncio.sleep(5)

    async def _watchdog(self, ws: websockets.ClientConnection) -> None:
        """Force-close the WS if no message arrives for 90s — catches silent subscription loss after Klipper restarts."""
        while ws.state.value == 1:  # OPEN
            await asyncio.sleep(30)
            idle = asyncio.get_event_loop().time() - self._last_msg_at
            if idle > 90:
                log.warning("Moonraker WS silent for %.0fs — forcing reconnect", idle)
                await ws.close()
                return

    def stop(self) -> None:
        self._running = False
        if self._ws:
            asyncio.create_task(self._ws.close())

    async def _subscribe(self, ws: websockets.ClientConnection) -> None:
        self._req_id += 1
        await ws.send(
            json.dumps(
                {
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
                }
            )
        )

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
