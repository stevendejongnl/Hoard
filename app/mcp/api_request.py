"""Turns the arguments of a tool call into a request to the API, and sends it."""

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from app.mcp.catalog import ToolDefinition

CONFIRMATION_ARGUMENT = "confirm"


class ToolArgumentError(ValueError):
    pass


@dataclass(frozen=True)
class ApiRequest:
    method: str
    path: str
    query: dict[str, Any]
    body: dict[str, Any] | None


@dataclass(frozen=True)
class ApiReply:
    status_code: int
    text: str


def read_known_arguments(tool: ToolDefinition, arguments: dict) -> dict:
    allowed = {*tool.path_parameter_names, *tool.query_parameter_names, *tool.body_property_names}
    allowed.add(CONFIRMATION_ARGUMENT)
    unknown = sorted(set(arguments) - allowed)
    if unknown:
        raise ToolArgumentError(f"unknown argument: {', '.join(unknown)}")
    return {name: value for name, value in arguments.items() if name != CONFIRMATION_ARGUMENT}


def fill_path(tool: ToolDefinition, arguments: dict) -> str:
    path = tool.path
    for name in tool.path_parameter_names:
        if name not in arguments:
            raise ToolArgumentError(f"missing argument: {name}")
        path = path.replace("{" + name + "}", quote(str(arguments[name]), safe=""))
    return path


def build_api_request(tool: ToolDefinition, arguments: dict) -> ApiRequest:
    known = read_known_arguments(tool, arguments)
    query = {name: known[name] for name in tool.query_parameter_names if name in known}
    body = {name: known[name] for name in tool.body_property_names if name in known}
    return ApiRequest(method=tool.method, path=fill_path(tool, known), query=query, body=body or None)


class InProcessApi:
    """Sends the requests to the application itself, without leaving the process, so they are the same as the app's own."""

    def __init__(self, application) -> None:
        self.transport = httpx.ASGITransport(app=application)

    async def __call__(self, request: ApiRequest) -> ApiReply:
        async with httpx.AsyncClient(transport=self.transport, base_url="http://hoard", timeout=60) as client:
            response = await client.request(request.method, request.path, params=request.query, json=request.body)
        return ApiReply(status_code=response.status_code, text=response.text)
