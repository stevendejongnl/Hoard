"""The tools of the MCP server: one per operation of the API, read from its OpenAPI description."""

from dataclasses import dataclass

# Operations that cannot be a tool: streams and binary files.
LEFT_OUT_OPERATIONS = {
    "stream_stream_get",
    "spa__full_path__get",
    "file_thumbnail_api_files_thumbnail_get",
    "thumbnail_from_gcode_api_files_thumbnail_from_gcode_get",
    "proxy_snapshot_api_webcams__index__snapshot_get",
    "proxy_stream_api_webcams__index__stream_get",
    "download_file_api_projects__project_id__files__file_id__download_get",
    "serve_photo_api_photos__job_id___filename__get",
}
LEFT_OUT_PATH_PREFIXES = ("/mcp",)
DESTRUCTIVE_TOOLS = {"cancel_print", "emergency_stop", "firmware_restart", "power_off", "switch_off"}
OPERATION_ID_SEPARATOR = "_api_"
HTTP_METHODS = ("get", "post", "put", "patch", "delete")
BODY_MEDIA_TYPE = "application/json"
CONFIRMATION_PROPERTY = {
    "type": "boolean",
    "description": "Must be true. Say what will happen to the person first, because this cannot be undone.",
}


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    required_scope: str
    method: str
    path: str
    input_schema: dict
    path_parameter_names: tuple[str, ...]
    query_parameter_names: tuple[str, ...]
    body_property_names: tuple[str, ...]
    is_destructive: bool


def create_tool_name(operation_id: str) -> str:
    return operation_id.split(OPERATION_ID_SEPARATOR, maxsplit=1)[0].removesuffix("_get")


def find_required_scope(method: str) -> str:
    if method == "DELETE":
        return "admin"
    return "read" if method == "GET" else "control"


def resolve_reference(schema: dict, components: dict) -> dict:
    reference = schema.get("$ref")
    if not reference:
        return schema
    return components.get(reference.rsplit("/", 1)[-1], {})


def read_body_schema(operation: dict, components: dict) -> dict | None:
    content = operation.get("requestBody", {}).get("content", {})
    if BODY_MEDIA_TYPE not in content:
        return None
    return resolve_reference(content[BODY_MEDIA_TYPE].get("schema", {}), components)


def is_left_out(path: str, operation: dict) -> bool:
    if operation.get("operationId") in LEFT_OUT_OPERATIONS or path.startswith(LEFT_OUT_PATH_PREFIXES):
        return True
    content = operation.get("requestBody", {}).get("content", {})
    return bool(content) and BODY_MEDIA_TYPE not in content


def create_description(operation: dict, method: str, path: str, is_destructive: bool) -> str:
    summary = operation.get("summary", "").strip().rstrip(".")
    warning = " This is destructive and needs confirm=true." if is_destructive else ""
    return f"{summary}. ({method} {path}){warning}"


def create_input_schema(parameters: list[dict], body: dict | None, is_destructive: bool) -> dict:
    properties = {parameter["name"]: parameter.get("schema", {}) for parameter in parameters}
    required = [parameter["name"] for parameter in parameters if parameter.get("required")]
    properties.update((body or {}).get("properties", {}))
    required += (body or {}).get("required", [])
    if is_destructive:
        properties["confirm"] = CONFIRMATION_PROPERTY
        required.append("confirm")
    return {"type": "object", "properties": properties, "required": required}


def names_in(parameters: list[dict], location: str) -> tuple[str, ...]:
    return tuple(parameter["name"] for parameter in parameters if parameter["in"] == location)


def create_tool(path: str, method: str, operation: dict, components: dict) -> ToolDefinition:
    name = create_tool_name(operation["operationId"])
    http_method = method.upper()
    is_destructive = http_method == "DELETE" or name in DESTRUCTIVE_TOOLS
    parameters = operation.get("parameters", [])
    body = read_body_schema(operation, components)
    return ToolDefinition(
        name=name,
        description=create_description(operation, http_method, path, is_destructive),
        required_scope=find_required_scope(http_method),
        method=http_method,
        path=path,
        input_schema=create_input_schema(parameters, body, is_destructive),
        path_parameter_names=names_in(parameters, "path"),
        query_parameter_names=names_in(parameters, "query"),
        body_property_names=tuple((body or {}).get("properties", {})),
        is_destructive=is_destructive,
    )


def build_tool_definitions(openapi: dict) -> list[ToolDefinition]:
    components = openapi.get("components", {}).get("schemas", {})
    return [
        create_tool(path, method, operation, components)
        for path, operations in openapi["paths"].items()
        for method, operation in operations.items()
        if method in HTTP_METHODS and not is_left_out(path, operation)
    ]
