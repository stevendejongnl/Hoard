import json

from app.mcp.api_request import ApiReply, ApiRequest
from app.mcp.catalog import ToolDefinition
from app.mcp.server import MAXIMUM_REPLY_CHARACTERS, McpServer
from app.mcp.tokens import McpClient

READER = McpClient(name="laptop", scope="read")
OPERATOR = McpClient(name="claude", scope="control")
ADMIN = McpClient(name="owner", scope="admin")


def create_tool(name: str, scope: str, destructive: bool = False) -> ToolDefinition:
    required = ["confirm"] if destructive else []
    return ToolDefinition(
        name=name,
        description=f"{name} description",
        required_scope=scope,
        method="GET" if scope == "read" else "POST",
        path=f"/api/{name}",
        input_schema={"type": "object", "properties": {}, "required": required},
        path_parameter_names=(),
        query_parameter_names=(),
        body_property_names=(),
        is_destructive=destructive,
    )


class FakeApi:
    def __init__(self, reply: ApiReply | None = None) -> None:
        self.requests: list[ApiRequest] = []
        self.reply = reply or ApiReply(status_code=200, text='{"ok": true}')

    async def __call__(self, request: ApiRequest) -> ApiReply:
        self.requests.append(request)
        return self.reply


class FakeAudit:
    def __init__(self) -> None:
        self.entries: list[tuple[str, str, str]] = []

    def __call__(self, client_name: str, tool_name: str, outcome: str) -> None:
        self.entries.append((client_name, tool_name, outcome))


def create_server(api: FakeApi | None = None, audit: FakeAudit | None = None) -> McpServer:
    tools = [
        create_tool("list_spools", "read"),
        create_tool("pause_print", "control"),
        create_tool("delete_spool", "admin", True),
    ]
    return McpServer(tools=tools, call_api=api or FakeApi(), audit=audit or FakeAudit(), version="9.9.9")


def request(method: str, params: dict | None = None, identifier: int | None = 1) -> dict:
    message: dict = {"jsonrpc": "2.0", "method": method}
    if identifier is not None:
        message["id"] = identifier
    if params is not None:
        message["params"] = params
    return message


async def call_tool(server: McpServer, client: McpClient, name: str, arguments: dict | None = None) -> dict:
    reply = await server.handle(request("tools/call", {"name": name, "arguments": arguments or {}}), client)
    assert reply is not None
    return reply


async def test_initialize_names_the_server_and_offers_tools() -> None:
    reply = await create_server().handle(request("initialize", {"protocolVersion": "2025-06-18"}), READER)
    assert reply["id"] == 1
    assert reply["result"]["protocolVersion"] == "2025-06-18"
    assert reply["result"]["serverInfo"] == {"name": "hoard", "version": "9.9.9"}
    assert "tools" in reply["result"]["capabilities"]


async def test_initialize_answers_a_version_it_does_not_know_with_its_own() -> None:
    reply = await create_server().handle(request("initialize", {"protocolVersion": "1999-01-01"}), READER)
    assert reply["result"]["protocolVersion"] == "2025-06-18"


async def test_ping_answers_empty() -> None:
    assert (await create_server().handle(request("ping"), READER))["result"] == {}


async def test_a_notification_gets_no_answer() -> None:
    assert await create_server().handle(request("notifications/initialized", identifier=None), READER) is None


async def test_the_list_holds_only_the_tools_the_client_may_use() -> None:
    server = create_server()
    names = {}
    for client in (READER, OPERATOR, ADMIN):
        reply = await server.handle(request("tools/list"), client)
        names[client.name] = {tool["name"] for tool in reply["result"]["tools"]}
    assert names["laptop"] == {"list_spools"}
    assert names["claude"] == {"list_spools", "pause_print"}
    assert names["owner"] == {"list_spools", "pause_print", "delete_spool"}


async def test_a_listed_tool_has_a_name_a_description_and_an_input_schema() -> None:
    reply = await create_server().handle(request("tools/list"), READER)
    assert reply["result"]["tools"][0] == {
        "name": "list_spools",
        "description": "list_spools description",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    }


async def test_calling_a_tool_sends_its_request_and_returns_the_reply_as_text() -> None:
    api = FakeApi()
    reply = await call_tool(create_server(api), READER, "list_spools")
    assert [(sent.method, sent.path) for sent in api.requests] == [("GET", "/api/list_spools")]
    assert reply["result"]["isError"] is False
    assert json.loads(reply["result"]["content"][0]["text"]) == {"ok": True}


async def test_an_error_of_the_api_is_a_tool_error_with_its_status() -> None:
    api = FakeApi(ApiReply(status_code=409, text='{"detail": "tag taken"}'))
    reply = await call_tool(create_server(api), OPERATOR, "pause_print")
    assert reply["result"]["isError"] is True
    assert "409" in reply["result"]["content"][0]["text"]
    assert "tag taken" in reply["result"]["content"][0]["text"]


async def test_a_client_cannot_call_a_tool_above_its_scope() -> None:
    api = FakeApi()
    reply = await call_tool(create_server(api), READER, "pause_print")
    assert reply["result"]["isError"] is True
    assert "control" in reply["result"]["content"][0]["text"]
    assert api.requests == []


async def test_a_destructive_tool_does_nothing_without_the_confirmation() -> None:
    api = FakeApi()
    server = create_server(api)
    refused = await call_tool(server, ADMIN, "delete_spool", {"confirm": False})
    assert refused["result"]["isError"] is True
    assert "confirm" in refused["result"]["content"][0]["text"]
    assert api.requests == []
    accepted = await call_tool(server, ADMIN, "delete_spool", {"confirm": True})
    assert accepted["result"]["isError"] is False
    assert len(api.requests) == 1


async def test_an_unknown_tool_is_a_protocol_error() -> None:
    reply = await call_tool(create_server(), READER, "format_disk")
    assert reply["error"]["code"] == -32602


async def test_an_unknown_method_is_a_protocol_error() -> None:
    reply = await create_server().handle(request("resources/list"), READER)
    assert reply["error"]["code"] == -32601


async def test_a_message_that_is_not_a_request_is_an_invalid_request() -> None:
    reply = await create_server().handle({"jsonrpc": "2.0", "id": 3}, READER)
    assert reply["error"]["code"] == -32600
    assert reply["id"] == 3


async def test_a_reply_that_is_too_long_is_cut_and_says_so() -> None:
    api = FakeApi(ApiReply(status_code=200, text="x" * (MAXIMUM_REPLY_CHARACTERS + 50)))
    reply = await call_tool(create_server(api), READER, "list_spools")
    text = reply["result"]["content"][0]["text"]
    assert len(text) < MAXIMUM_REPLY_CHARACTERS + 200
    assert "cut" in text


async def test_every_call_is_written_to_the_audit_log_without_its_arguments() -> None:
    audit = FakeAudit()
    server = create_server(audit=audit)
    await call_tool(server, READER, "list_spools", {"secret": "do-not-log"})
    await call_tool(server, READER, "pause_print")
    assert audit.entries == [("laptop", "list_spools", "ok"), ("laptop", "pause_print", "forbidden")]
