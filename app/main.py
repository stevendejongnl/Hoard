import asyncio
import logging
import mimetypes
import os
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app import cache, db, home_assistant, recorder, server_sent_events
from app.config import settings
from app.influx import influx
from app.mcp.api_request import InProcessApi
from app.mcp.catalog import build_tool_definitions
from app.mcp.endpoint import create_mcp_router
from app.mcp.server import McpServer
from app.mcp.tokens import McpClient, parse_registered_clients
from app.moonraker import moonraker
from app.routes import (
    chunks,
    control,
    files,
    history,
    predict,
    prints,
    projects,
    push,
    search,
    spools,
    temperatures,
    webcams,
)
from app.routes.projects import enrich_existing_links
from app.server_sent_events import hub

mimetypes.add_type("application/manifest+json", ".webmanifest")

_APP_VERSION = os.getenv("APP_VERSION", "dev")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


async def _price_recorder_loop() -> None:
    """Record the current electricity price to InfluxDB every 30 minutes."""
    while True:
        await asyncio.sleep(1800)
        try:
            await home_assistant.record_current_price()
        except Exception as exc:
            log.warning("price recorder error: %s", exc)


def _start_background_tasks() -> list[asyncio.Task]:
    """Start the long-running tasks and return the ones that must be cancelled on shutdown."""
    cancellable_tasks = [
        asyncio.create_task(moonraker.connect_ws()),
        asyncio.create_task(server_sent_events._poll_ha()),
        asyncio.create_task(server_sent_events._poll_pi_stats()),
        asyncio.create_task(server_sent_events._poll_printer_state()),
    ]
    # Full backfill on startup, then quick reconcile every 5 minutes
    asyncio.create_task(recorder.startup_reconcile())
    asyncio.create_task(recorder.periodic_reconcile())
    asyncio.create_task(enrich_existing_links())
    asyncio.create_task(_price_recorder_loop())
    return cancellable_tasks


async def _stop_background_tasks(cancellable_tasks: list[asyncio.Task]) -> None:
    moonraker.stop()
    for task in cancellable_tasks:
        task.cancel()
    influx.close()
    await cache.close()


def create_lifespan(app_settings: Any = settings):
    """The start and the stop of the app, with the settings it reads passed in."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await db.init_db(app_settings.database_path)
        await cache.init(app_settings.redis_url)

        server_sent_events.register_ws_handlers()
        recorder.register_ws_handlers()
        cancellable_tasks = _start_background_tasks()

        log.info("Hoard started, db=%s", app_settings.database_path)
        yield
        await _stop_background_tasks(cancellable_tasks)

    return lifespan


_ROUTERS = (
    control.router,
    chunks.router,
    files.router,
    webcams.router,
    history.router,
    predict.router,
    spools.router,
    search.router,
    projects.router,
    prints.router,
    push.router,
    temperatures.router,
)

# Real files of the built frontend (PWA manifest, sw.js, icons) are served as they are, every other path gets
# index.html for client-side routing. These files must not be cached, so a new release reaches the browser.
_NO_CACHE_FILES = {"sw.js", "manifest.webmanifest", "index.html"}


def _create_mcp_server_provider(app: FastAPI) -> Callable[[], McpServer]:
    """The MCP server of `app`, built on the first request, when every route of the app is in place."""
    servers: list[McpServer] = []

    def provide_mcp_server() -> McpServer:
        if not servers:
            servers.append(McpServer(build_tool_definitions(app.openapi()), InProcessApi(app), version=_APP_VERSION))
        return servers[0]

    return provide_mcp_server


def _create_client_reader(app_settings: Any) -> Callable[[], dict[str, McpClient]]:
    """Reads the registered MCP clients on every request, so a changed setting counts at once."""

    def read_registered_clients() -> dict[str, McpClient]:
        return parse_registered_clients(app_settings.mcp_clients)

    return read_registered_clients


async def version():
    return {"version": _APP_VERSION}


async def _event_stream(request: Request, queue: asyncio.Queue[str]):
    try:
        while not await request.is_disconnected():
            try:
                yield await asyncio.wait_for(queue.get(), timeout=15.0)
            except TimeoutError:
                yield ": ping\n\n"
    finally:
        hub.unsubscribe(queue)


async def stream(request: Request):
    return StreamingResponse(
        _event_stream(request, hub.subscribe()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _mount_static_site(app: FastAPI, static_directory: Path) -> None:
    if not (static_directory / "index.html").is_file():
        return
    app.mount("/assets", StaticFiles(directory=str(static_directory / "assets")), name="assets")

    async def spa(full_path: str):
        candidate = (static_directory / full_path).resolve()
        if candidate.is_relative_to(static_directory.resolve()) and candidate.is_file():
            headers = {"Cache-Control": "no-cache"} if candidate.name in _NO_CACHE_FILES else None
            return FileResponse(candidate, headers=headers)
        return FileResponse(str(static_directory / "index.html"), headers={"Cache-Control": "no-cache"})

    app.add_api_route("/{full_path:path}", spa, methods=["GET"])


def create_app(app_settings: Any = settings) -> FastAPI:
    """The Hoard app: its routes, the MCP endpoint and the built frontend, from the settings it is given."""
    app = FastAPI(title="Hoard", lifespan=create_lifespan(app_settings))
    for router in _ROUTERS:
        app.include_router(router)
    app.include_router(create_mcp_router(_create_mcp_server_provider(app), _create_client_reader(app_settings)))
    app.add_api_route("/api/version", version, methods=["GET"])
    app.add_api_route("/stream", stream, methods=["GET"])
    _mount_static_site(app, Path(app_settings.static_dir))
    return app


app = create_app()
