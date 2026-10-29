"""The collaborators of the routes, handed in with FastAPI `Depends`.

Each provider returns the real collaborator. A test replaces a provider in `app.dependency_overrides` with a
hand-written fake, so a route never reaches for a module-level singleton itself.
"""

from collections.abc import Awaitable, Callable
from types import ModuleType
from typing import Annotated, Any

import httpx
from fastapi import Depends

from app import cache, home_assistant
from app.db import Database as SqliteDatabase
from app.db import default_database
from app.gcode_meta import extract_gcode_meta
from app.influx import InfluxClient, influx
from app.moonraker import MoonrakerClient, moonraker
from app.routes.thumbnail_cache import ThumbnailCache, thumbnail_cache


def provide_moonraker() -> MoonrakerClient:
    return moonraker


def provide_influx() -> InfluxClient:
    return influx


def provide_home_assistant() -> ModuleType:
    return home_assistant


def provide_database() -> SqliteDatabase:
    return default_database


def provide_cache() -> ModuleType:
    return cache


def provide_gcode_meta_reader() -> Callable[[str], Awaitable[dict[str, Any]]]:
    return extract_gcode_meta


def provide_thumbnail_cache() -> ThumbnailCache:
    return thumbnail_cache


def provide_http_client_factory() -> Callable[..., httpx.AsyncClient]:
    return httpx.AsyncClient


def provide_printer_client_factory(
    moonraker: MoonrakerClient = Depends(provide_moonraker),
) -> Callable[..., httpx.AsyncClient]:
    """Clients for the printer's host: they fail at once while the printer is known to be off."""
    return moonraker.http_client


Moonraker = Annotated[MoonrakerClient, Depends(provide_moonraker)]
Influx = Annotated[InfluxClient, Depends(provide_influx)]
HomeAssistant = Annotated[ModuleType, Depends(provide_home_assistant)]
Database = Annotated[SqliteDatabase, Depends(provide_database)]
Cache = Annotated[ModuleType, Depends(provide_cache)]
GcodeMetaReader = Annotated[Callable[[str], Awaitable[dict[str, Any]]], Depends(provide_gcode_meta_reader)]
ThumbnailStore = Annotated[ThumbnailCache, Depends(provide_thumbnail_cache)]
HttpClientFactory = Annotated[Callable[..., httpx.AsyncClient], Depends(provide_http_client_factory)]
PrinterClientFactory = Annotated[Callable[..., httpx.AsyncClient], Depends(provide_printer_client_factory)]
