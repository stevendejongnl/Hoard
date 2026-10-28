"""The HTTP side of the MCP server: one POST route, with a bearer token, served under /mcp."""

from collections.abc import Callable

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.mcp.server import INVALID_REQUEST, McpServer, create_error, parse_message
from app.mcp.tokens import McpClient, find_client

PARSE_ERROR = -32700


def refuse(status_code: int, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code, headers=headers)


def create_mcp_router(
    get_server: Callable[[], McpServer], get_registered_clients: Callable[[], dict[str, McpClient]]
) -> APIRouter:
    router = APIRouter()

    @router.post("/mcp", include_in_schema=False)
    async def handle_mcp(request: Request) -> Response:
        client = find_client(request.headers.get("authorization"), get_registered_clients())
        if client is None:
            return refuse(401, "a valid bearer token is needed", {"WWW-Authenticate": 'Bearer realm="hoard"'})
        if "origin" in request.headers:
            return refuse(403, "requests from a web page are not accepted")
        message = parse_message(await request.body())
        if message is None:
            return JSONResponse(create_error(None, PARSE_ERROR, "not JSON"), status_code=400)
        if not isinstance(message, dict):
            return JSONResponse(create_error(None, INVALID_REQUEST, "send one message at a time"), status_code=400)
        reply = await get_server().handle(message, client)
        return Response(status_code=202) if reply is None else JSONResponse(reply)

    @router.get("/mcp", include_in_schema=False)
    async def refuse_stream() -> Response:
        return Response(status_code=405, headers={"Allow": "POST"})

    return router
