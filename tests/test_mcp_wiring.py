import httpx

from app.config import Settings, settings
from app.main import app
from app.mcp.catalog import build_tool_definitions
from app.mcp.new_token import create_client_entry
from app.mcp.tokens import hash_token, parse_registered_clients


def test_the_clients_are_a_setting_that_is_empty_by_default_and_never_printed(monkeypatch) -> None:
    monkeypatch.delenv("MCP_CLIENTS", raising=False)
    assert Settings(_env_file=None).mcp_clients == ""
    assert "abc123" not in repr(Settings(_env_file=None, mcp_clients="claude:read:abc123"))


def test_every_tool_of_the_real_app_has_its_own_name() -> None:
    names = [tool.name for tool in build_tool_definitions(app.openapi())]
    assert len(names) == len(set(names))


def test_the_tools_of_the_real_app_cover_the_printer_the_spools_the_projects_and_the_power() -> None:
    names = {tool.name for tool in build_tool_definitions(app.openapi())}
    expected = {
        "pause_print",
        "cancel_print",
        "list_history",
        "create_spool",
        "list_projects",
        "power_off",
        "switch_on",
    }
    assert expected <= names


def test_a_new_client_entry_works_with_the_token_it_was_made_for() -> None:
    token, entry = create_client_entry("claude", "control")
    registered = parse_registered_clients(entry)
    assert list(registered) == [hash_token(token)]
    assert token not in entry


async def test_the_real_app_answers_mcp_only_to_a_client_that_is_registered(monkeypatch) -> None:
    monkeypatch.setattr(settings, "mcp_clients", f"claude:read:{hash_token('real-token')}")
    message = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://hoard") as client:
        refused = await client.post("/mcp", json=message)
        accepted = await client.post("/mcp", json=message, headers={"Authorization": "Bearer real-token"})
    assert refused.status_code == 401
    names = {tool["name"] for tool in accepted.json()["result"]["tools"]}
    assert "list_history" in names
    assert "pause_print" not in names
