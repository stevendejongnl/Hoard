from app.control_access import ControlAccess
from app.main import app
from app.mcp.catalog import build_tool_definitions
from app.mcp.server import McpServer
from app.mcp.tokens import McpClient
from tests.test_mcp_server import FakeApi, FakeAudit, call_tool, create_tool, request

READER = McpClient(name="laptop", scope="read")
OPERATOR = McpClient(name="claude", scope="control")


def create_server(access: ControlAccess | None = None, api: FakeApi | None = None, audit: FakeAudit | None = None):
    moving = create_tool("move", "control")
    gated = type(moving)(**{**moving.__dict__, "needs_approval": True})
    tools = [create_tool("pause_print", "control"), gated]
    return McpServer(
        tools=tools,
        call_api=api or FakeApi(),
        audit=audit or FakeAudit(),
        control_access=access or ControlAccess(),
    )


async def test_a_tool_that_moves_the_printer_is_refused_until_a_person_allows_it():
    api, audit = FakeApi(), FakeAudit()
    server = create_server(api=api, audit=audit)
    reply = await call_tool(server, OPERATOR, "move")
    assert reply["result"]["isError"] is True
    assert "request_control_access" in reply["result"]["content"][0]["text"]
    assert api.requests == []
    assert audit.entries == [("claude", "move", "not_allowed")]


async def test_a_tool_that_does_not_need_approval_runs_as_before():
    api = FakeApi()
    reply = await call_tool(create_server(api=api), OPERATOR, "pause_print")
    assert reply["result"]["isError"] is False
    assert len(api.requests) == 1


async def test_asking_for_access_puts_a_request_on_the_dashboard():
    access = ControlAccess()
    server = create_server(access)
    reply = await call_tool(server, OPERATOR, "request_control_access", {"reason": "level the bed"})
    assert reply["result"]["isError"] is False
    assert "dashboard" in reply["result"]["content"][0]["text"]
    assert [(item["client"], item["reason"]) for item in access.snapshot()["pending"]] == [("claude", "level the bed")]


async def test_a_tool_runs_once_the_person_has_allowed_the_client():
    api, access = FakeApi(), ControlAccess()
    server = create_server(access, api)
    pending = await access.request("claude", "")
    await access.allow(pending["id"])
    reply = await call_tool(server, OPERATOR, "move")
    assert reply["result"]["isError"] is False
    assert len(api.requests) == 1


async def test_the_access_of_one_client_is_not_the_access_of_another():
    access = ControlAccess()
    server = create_server(access)
    pending = await access.request("other", "")
    await access.allow(pending["id"])
    reply = await call_tool(server, OPERATOR, "move")
    assert reply["result"]["isError"] is True


async def test_asking_again_while_allowed_says_so():
    access = ControlAccess()
    server = create_server(access)
    pending = await access.request("claude", "")
    await access.allow(pending["id"])
    reply = await call_tool(server, OPERATOR, "request_control_access")
    assert "already" in reply["result"]["content"][0]["text"].lower()


async def test_asking_for_access_needs_the_control_scope():
    server = create_server()
    listed = await server.handle(request("tools/list"), READER)
    assert "request_control_access" not in [tool["name"] for tool in listed["result"]["tools"]]
    listed = await server.handle(request("tools/list"), OPERATOR)
    assert "request_control_access" in [tool["name"] for tool in listed["result"]["tools"]]
    refused = await call_tool(server, READER, "request_control_access")
    assert refused["result"]["isError"] is True


async def test_the_instructions_tell_the_assistant_to_ask_first():
    reply = await create_server().handle(request("initialize", {"protocolVersion": "2025-06-18"}), OPERATOR)
    assert "request_control_access" in reply["result"]["instructions"]


def test_the_commands_that_move_heat_or_start_work_on_the_printer_need_approval_and_the_person_s_own_buttons_are_not_tools():
    tools = {tool.name: tool for tool in build_tool_definitions(app.openapi())}
    needing = {
        "move",
        "home",
        "extrude",
        "temperature",
        "speed",
        "flow",
        "fan",
        "babystep",
        "macro",
        "gcode",
        "calibrate",
        "probe",
        "upload_gcode",
        "start_print",
    }
    assert {name for name, tool in tools.items() if tool.needs_approval} == needing
    assert not [tool for tool in tools.values() if tool.path.startswith(("/api/control/access", "/api/control/layout"))]
    assert {"pause_print", "resume_print", "cancel_print", "emergency_stop"} <= set(tools)
    assert not tools["emergency_stop"].needs_approval


async def refusal_after(prepare) -> str:
    access = ControlAccess()
    server = create_server(access)
    await prepare(access)
    reply = await call_tool(server, OPERATOR, "move")
    assert reply["result"]["isError"] is True
    return reply["result"]["content"][0]["text"]


async def test_a_request_that_is_waiting_says_so_and_asks_not_to_send_another():
    async def prepare(access: ControlAccess) -> None:
        await access.request("claude", "")

    text = await refusal_after(prepare)
    assert "waiting on the Hoard dashboard" in text
    assert "do not send another request" in text.lower()


async def test_a_denial_says_the_person_said_no_and_asks_not_to_ask_again():
    async def prepare(access: ControlAccess) -> None:
        request = await access.request("claude", "")
        await access.deny(request["id"])

    text = await refusal_after(prepare)
    assert "denied" in text
    assert "do not ask again" in text.lower()


async def test_access_that_was_taken_back_says_so():
    async def prepare(access: ControlAccess) -> None:
        request = await access.request("claude", "")
        await access.allow(request["id"])
        await access.revoke("claude")

    text = await refusal_after(prepare)
    assert "took the access back" in text
    assert "do not ask again" in text.lower()


async def test_access_that_ran_out_can_be_asked_for_again():
    clock = [1000.0]
    access = ControlAccess(clock=lambda: clock[0])
    server = create_server(access)
    request = await access.request("claude", "")
    await access.allow(request["id"])
    clock[0] += 31 * 60
    text = (await call_tool(server, OPERATOR, "move"))["result"]["content"][0]["text"]
    assert "30 minutes" in text
    assert "request_control_access" in text
