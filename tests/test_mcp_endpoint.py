import httpx
import pytest
from fastapi import FastAPI

from app.mcp.api_request import ApiReply
from app.mcp.catalog import ToolDefinition
from app.mcp.endpoint import create_mcp_router
from app.mcp.server import McpServer
from app.mcp.tokens import McpClient, hash_token, parse_registered_clients

REGISTERED = parse_registered_clients(f"claude:control:{hash_token('good-token')}")
LIST_TOOL = ToolDefinition(
    name="list_spools",
    description="List",
    required_scope="read",
    method="GET",
    path="/api/spools",
    input_schema={"type": "object", "properties": {}, "required": []},
    path_parameter_names=(),
    query_parameter_names=(),
    body_property_names=(),
    is_destructive=False,
)


async def fake_api(_request) -> ApiReply:
    return ApiReply(status_code=200, text="[]")


def create_client() -> httpx.AsyncClient:
    application = FastAPI()
    server = McpServer(tools=[LIST_TOOL], call_api=fake_api, audit=lambda *_: None, version="1")
    application.include_router(create_mcp_router(lambda: server, lambda: REGISTERED))
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url="http://hoard")


GOOD = {"Authorization": "Bearer good-token"}
PING = {"jsonrpc": "2.0", "id": 1, "method": "ping"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "Basic good-token"}])
async def test_a_request_without_a_right_token_is_refused_with_a_bearer_challenge(headers: dict) -> None:
    async with create_client() as client:
        response = await client.post("/mcp", json=PING, headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert "good-token" not in response.text


async def test_a_request_with_the_token_is_answered() -> None:
    async with create_client() as client:
        response = await client.post("/mcp", json=PING, headers=GOOD)
    assert response.status_code == 200
    assert response.json() == {"jsonrpc": "2.0", "id": 1, "result": {}}


async def test_nothing_is_registered_means_nobody_gets_in() -> None:
    application = FastAPI()
    server = McpServer(tools=[LIST_TOOL], call_api=fake_api, audit=lambda *_: None, version="1")
    application.include_router(create_mcp_router(lambda: server, lambda: {}))
    transport = httpx.ASGITransport(app=application)
    async with httpx.AsyncClient(transport=transport, base_url="http://hoard") as client:
        response = await client.post("/mcp", json=PING, headers={"Authorization": "Bearer "})
    assert response.status_code == 401


async def test_a_request_from_a_web_page_is_refused_even_with_the_token() -> None:
    async with create_client() as client:
        response = await client.post("/mcp", json=PING, headers={**GOOD, "Origin": "https://evil.example"})
    assert response.status_code == 403


async def test_a_notification_is_accepted_without_an_answer() -> None:
    async with create_client() as client:
        response = await client.post(
            "/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=GOOD
        )
    assert response.status_code == 202
    assert response.content == b""


async def test_text_that_is_not_json_is_a_parse_error() -> None:
    async with create_client() as client:
        response = await client.post("/mcp", content=b"{nope", headers={**GOOD, "Content-Type": "application/json"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == -32700


async def test_a_batch_is_an_invalid_request() -> None:
    async with create_client() as client:
        response = await client.post("/mcp", json=[PING], headers=GOOD)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == -32600


async def test_get_is_not_allowed_because_nothing_is_streamed() -> None:
    async with create_client() as client:
        response = await client.get("/mcp", headers=GOOD)
    assert response.status_code == 405
    assert response.headers["allow"] == "POST"


async def test_the_client_that_asked_is_the_one_whose_scope_counts() -> None:
    async with create_client() as client:
        response = await client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, headers=GOOD)
    assert [tool["name"] for tool in response.json()["result"]["tools"]] == ["list_spools"]
    assert McpClient("claude", "control").allows("read")
