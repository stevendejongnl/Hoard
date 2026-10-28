"""The MCP protocol (JSON-RPC 2.0) for tools: initialize, ping, list the tools and call one."""

import json
import logging
from collections.abc import Awaitable, Callable

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
    "stop, cut power or delete need confirm=true: say what will happen to the person before you set it."
)

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
        self, tools: list[ToolDefinition], call_api: ApiCaller, audit: AuditLog = log_audit, version: str = "dev"
    ) -> None:
        self.tools = {tool.name: tool for tool in tools}
        self.call_api = call_api
        self.audit = audit
        self.version = version

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
        return {
            "tools": [
                {"name": tool.name, "description": tool.description, "inputSchema": tool.input_schema}
                for tool in self.tools.values()
                if client.allows(tool.required_scope)
            ]
        }

    async def call_tool(self, identifier, params: dict, client: McpClient) -> dict:
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
