"""The collaborators of the routes, handed in with FastAPI `Depends`.

Each provider returns the real collaborator. A test replaces a provider in `app.dependency_overrides` with a
hand-written fake, so a route never reaches for a module-level singleton itself.
"""

from collections.abc import Awaitable, Callable
from types import ModuleType
from typing import Annotated, Any

from fastapi import Depends

from app import cache, db, ha
from app.gcode_meta import extract_gcode_meta
from app.influx import InfluxClient, influx
from app.moonraker import MoonrakerClient, moonraker


def provide_moonraker() -> MoonrakerClient:
    return moonraker


def provide_influx() -> InfluxClient:
    return influx


def provide_home_assistant() -> ModuleType:
    return ha


def provide_database() -> ModuleType:
    return db


def provide_cache() -> ModuleType:
    return cache


def provide_gcode_meta_reader() -> Callable[[str], Awaitable[dict[str, Any]]]:
    return extract_gcode_meta


Moonraker = Annotated[MoonrakerClient, Depends(provide_moonraker)]
Influx = Annotated[InfluxClient, Depends(provide_influx)]
HomeAssistant = Annotated[ModuleType, Depends(provide_home_assistant)]
Database = Annotated[ModuleType, Depends(provide_database)]
Cache = Annotated[ModuleType, Depends(provide_cache)]
GcodeMetaReader = Annotated[Callable[[str], Awaitable[dict[str, Any]]], Depends(provide_gcode_meta_reader)]
