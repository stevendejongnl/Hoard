"""The MCP protocol (JSON-RPC 2.0) for tools: initialize, ping, list the tools and call one."""

import json
import logging
from collections.abc import Awaitable, Callable

from app.control_access import GRANT_SECONDS, ControlAccess
from app.mcp.api_request import ApiReply, ApiRequest, ToolArgumentError, build_api_request
from app.mcp.catalog import ToolDefinition
from app.mcp.tokens import McpClient

MAXIMUM_REPLY_CHARACTERS = 200_000
LATEST_PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INSTRUCTIONS = (
    "Hoard manages a 3D printer: print status and control, history, spools, projects and power. Tools that cancel, "
    "stop, cut power or delete need confirm=true: say what will happen to the person before you set it. Tools that "
    "move or heat the printer need the person's approval: call request_control_access, tell the person to allow it on "
    "the Hoard dashboard, and try again once they have. The access ends by itself after a while."
)
ACCESS_TOOL_NAME = "request_control_access"
ASK_AGAIN = f"Call {ACCESS_TOOL_NAME} to ask again, and tell the person to look at the Hoard dashboard."
DO_NOT_ASK_AGAIN = "Do not ask again unless the person asks you to."
REFUSAL_BY_STATE = {
    "waiting": (
        "A request is already waiting on the Hoard dashboard. Tell the person to allow it, then try again. "
        "Do not send another request."
    ),
    "denied": f"The person denied access on the Hoard dashboard. {DO_NOT_ASK_AGAIN}",
    "revoked": f"The person took the access back on the Hoard dashboard. {DO_NOT_ASK_AGAIN}",
    "ended": f"The {GRANT_SECONDS // 60} minutes of access have ended. {ASK_AGAIN}",
    "unanswered": f"Nobody answered the request in time. {ASK_AGAIN}",
}
NO_REQUEST = f"Call {ACCESS_TOOL_NAME}, tell them to allow it on the Hoard dashboard, then try again."


def explain_refusal(tool_name: str, state: str) -> str:
    return f"{tool_name} needs the person's approval. {REFUSAL_BY_STATE.get(state, NO_REQUEST)}"


ACCESS_TOOL = {
    "name": ACCESS_TOOL_NAME,
    "description": "Ask the person to let this client move and heat the printer. They allow it on the Hoard dashboard.",
    "inputSchema": {
        "type": "object",
        "properties": {"reason": {"type": "string", "description": "What you want to do, shown to the person."}},
        "required": [],
    },
}

ApiCaller = Callable[[ApiRequest], Awaitable[ApiReply]]
AuditLog = Callable[[str, str, str], None]
audit_logger = logging.getLogger("hoard.mcp.audit")


def log_audit(client_name: str, tool_name: str, outcome: str) -> None:
    audit_logger.info("client=%s tool=%s outcome=%s", client_name, tool_name, outcome)


def create_error(identifier, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": identifier, "error": {"code": code, "message": message}}


def create_result(identifier, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": identifier, "result": result}


def create_tool_result(text: str, is_error: bool) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


def cut_reply(text: str) -> str:
    if len(text) <= MAXIMUM_REPLY_CHARACTERS:
        return text
    return text[:MAXIMUM_REPLY_CHARACTERS] + "\n[the reply was cut here because it is too long]"


class McpServer:
    def __init__(
        self,
        tools: list[ToolDefinition],
        call_api: ApiCaller,
        audit: AuditLog = log_audit,
        version: str = "dev",
        control_access: ControlAccess | None = None,
    ) -> None:
        self.tools = {tool.name: tool for tool in tools}
        self.call_api = call_api
        self.audit = audit
        self.version = version
        self.control_access = control_access or ControlAccess()

    async def handle(self, message: dict, client: McpClient) -> dict | None:
        method = message.get("method")
        if not isinstance(method, str):
            return create_error(message.get("id"), INVALID_REQUEST, "not a request")
        if "id" not in message:
            return None
        identifier = message["id"]
        params = message.get("params") or {}
        if method == "tools/call":
            return await self.call_tool(identifier, params, client)
        handler = {"initialize": self.initialize, "ping": self.ping, "tools/list": self.list_tools}.get(method)
        if handler is None:
            return create_error(identifier, METHOD_NOT_FOUND, f"unknown method {method}")
        return create_result(identifier, handler(params, client))

    def initialize(self, params: dict, _client: McpClient) -> dict:
        asked = params.get("protocolVersion")
        return {
            "protocolVersion": asked if asked in SUPPORTED_PROTOCOL_VERSIONS else LATEST_PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "hoard", "version": self.version},
            "instructions": INSTRUCTIONS,
        }

    def ping(self, _params: dict, _client: McpClient) -> dict:
        return {}

    def list_tools(self, _params: dict, client: McpClient) -> dict:
        listed = [
            {"name": tool.name, "description": tool.description, "inputSchema": tool.input_schema}
            for tool in self.tools.values()
            if client.allows(tool.required_scope)
        ]
        return {"tools": [*listed, ACCESS_TOOL] if client.allows("control") else listed}

    async def ask_for_access(self, arguments: dict, client: McpClient) -> dict:
        if not client.allows("control"):
            self.audit(client.name, ACCESS_TOOL_NAME, "forbidden")
            return create_tool_result(
                f"{ACCESS_TOOL_NAME} needs the control scope, and this client has {client.scope}", True
            )
        request = await self.control_access.request(client.name, str(arguments.get("reason") or ""))
        self.audit(client.name, ACCESS_TOOL_NAME, "ok")
        if request is None:
            return create_tool_result("This client is already allowed to control the printer.", False)
        minutes = GRANT_SECONDS // 60
        return create_tool_result(
            "The person has been asked on the Hoard dashboard. Tell them to allow it, then try again. "
            f"Once allowed, it lasts {minutes} minutes. Until then these tools are refused.",
            False,
        )

    async def call_tool(self, identifier, params: dict, client: McpClient) -> dict:
        if params.get("name") == ACCESS_TOOL_NAME:
            return create_result(identifier, await self.ask_for_access(params.get("arguments") or {}, client))
        tool = self.tools.get(params.get("name", ""))
        if tool is None:
            return create_error(identifier, INVALID_PARAMS, f"unknown tool {params.get('name')}")
        result = await self.run_tool(tool, params.get("arguments") or {}, client)
        return create_result(identifier, result)

    async def run_tool(self, tool: ToolDefinition, arguments: dict, client: McpClient) -> dict:
        refusal = self.find_refusal(tool, arguments, client)
        if refusal:
            self.audit(client.name, tool.name, "forbidden")
            return create_tool_result(refusal, True)
        if tool.needs_approval and not self.control_access.is_granted(client.name):
            self.audit(client.name, tool.name, "not_allowed")
            return create_tool_result(explain_refusal(tool.name, self.control_access.find_state(client.name)), True)
        try:
            request = build_api_request(tool, arguments)
        except ToolArgumentError as error:
            self.audit(client.name, tool.name, "invalid")
            return create_tool_result(str(error), True)
        reply = await self.call_api(request)
        is_error = reply.status_code >= 400
        self.audit(client.name, tool.name, "error" if is_error else "ok")
        return create_tool_result(self.describe_reply(reply, is_error), is_error)

    def find_refusal(self, tool: ToolDefinition, arguments: dict, client: McpClient) -> str | None:
        if not client.allows(tool.required_scope):
            return f"{tool.name} needs the {tool.required_scope} scope, and this client has {client.scope}"
        if tool.is_destructive and arguments.get("confirm") is not True:
            return f"{tool.name} is destructive: say what will happen to the person, then call it with confirm=true"
        return None

    def describe_reply(self, reply: ApiReply, is_error: bool) -> str:
        text = f"HTTP {reply.status_code}: {reply.text}" if is_error else reply.text
        return cut_reply(text)


def parse_message(raw: bytes) -> dict | list | None:
    try:
        return json.loads(raw)
    except ValueError:
        return None
