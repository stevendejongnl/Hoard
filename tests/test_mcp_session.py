import re

import httpx
from fastapi import FastAPI

from app.control_access import ControlAccess
from app.mcp.api_request import ApiReply
from app.mcp.endpoint import create_mcp_router
from app.mcp.server import McpServer
from app.mcp.tokens import McpClient, hash_token, parse_registered_clients
from tests.access_fakes import PassingTime
from tests.test_mcp_server import create_tool

REGISTERED = parse_registered_clients(f"claude:control:{hash_token('good-token')}")
GOOD = {"Authorization": "Bearer good-token"}
SESSION_HEADER = "mcp-session-id"
INITIALIZE = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}
MOVE = {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "move", "arguments": {}}}


async def fake_api(_request) -> ApiReply:
    return ApiReply(status_code=200, text="{}")


def create_client(access: ControlAccess) -> httpx.AsyncClient:
    moving = create_tool("move", "control")
    gated = type(moving)(**{**moving.__dict__, "needs_approval": True})
    server = McpServer(tools=[gated], call_api=fake_api, audit=lambda *_: None, version="1", control_access=access)
    application = FastAPI()
    application.include_router(create_mcp_router(lambda: server, lambda: REGISTERED))
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url="http://hoard")


async def start_session(client: httpx.AsyncClient) -> str:
    return (await client.post("/mcp", json=INITIALIZE, headers=GOOD)).headers[SESSION_HEADER]


async def is_refused(client: httpx.AsyncClient, session: str | None) -> bool:
    headers = {**GOOD, **({SESSION_HEADER: session} if session else {})}
    reply = (await client.post("/mcp", json=MOVE, headers=headers)).json()
    return reply["result"]["isError"]


def test_a_client_without_a_session_is_known_by_its_name():
    assert McpClient(name="claude", scope="control").access_key == "claude"


def test_a_client_with_a_session_is_known_by_its_name_and_a_short_session():
    client = McpClient(name="claude", scope="control", session="abcdefgh1234")
    assert client.access_key == "claude (session abcdefgh)"


async def test_initializing_gives_the_client_a_session_of_its_own():
    async with create_client(ControlAccess()) as client:
        first = await start_session(client)
        second = await start_session(client)
    assert re.fullmatch(r"[A-Za-z0-9_-]{16,64}", first)
    assert first != second


async def test_a_grant_covers_one_session_and_not_another_with_the_same_token():
    access = ControlAccess()
    async with create_client(access) as client:
        first, second = await start_session(client), await start_session(client)
        key = McpClient(name="claude", scope="control", session=first).access_key
        pending = await access.request(key, "")
        await access.allow(pending["id"])
        assert await is_refused(client, first) is False
        assert await is_refused(client, second) is True


async def test_the_dashboard_sees_which_session_asks():
    time_passes = PassingTime()
    access = time_passes.access()
    seen: list[str] = []

    async def look() -> None:
        seen.extend(item["client"] for item in access.snapshot()["pending"])

    time_passes.answer = look
    async with create_client(access) as client:
        session = await start_session(client)
        asking = {**MOVE, "params": {"name": "request_control_access", "arguments": {"reason": "test"}}}
        await client.post("/mcp", json=asking, headers={**GOOD, SESSION_HEADER: session})
    assert seen == [f"claude (session {session[:8]})"]


async def test_a_client_that_sends_no_session_keeps_being_known_by_its_name():
    access = ControlAccess()
    async with create_client(access) as client:
        pending = await access.request("claude", "")
        await access.allow(pending["id"])
        assert await is_refused(client, None) is False


async def test_a_session_that_is_not_plain_text_is_ignored():
    access = ControlAccess()
    async with create_client(access) as client:
        pending = await access.request("claude", "")
        await access.allow(pending["id"])
        assert await is_refused(client, "<script>alert(1)</script>") is False
