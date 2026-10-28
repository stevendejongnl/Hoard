from app.mcp.catalog import build_tool_definitions

OPENAPI = {
    "paths": {
        "/api/spools": {
            "get": {
                "operationId": "list_spools_api_spools_get",
                "summary": "List Spools",
                "parameters": [
                    {"name": "limit", "in": "query", "required": False, "schema": {"type": "integer"}},
                ],
            },
            "post": {
                "operationId": "create_spool_api_spools_post",
                "summary": "Create Spool",
                "requestBody": {
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SpoolBody"}}}
                },
            },
        },
        "/api/spools/{spool_id}": {
            "delete": {
                "operationId": "delete_spool_api_spools__spool_id__delete",
                "summary": "Delete Spool",
                "parameters": [{"name": "spool_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
            },
        },
        "/api/control/cancel": {
            "post": {"operationId": "cancel_print_api_control_cancel_post", "summary": "Cancel Print"},
        },
        "/api/control/power/off": {
            "post": {"operationId": "power_off_api_control_power_off_post", "summary": "Power Off"},
        },
        "/api/files/upload": {
            "post": {
                "operationId": "upload_file_api_files_upload_post",
                "requestBody": {"content": {"multipart/form-data": {"schema": {"type": "object"}}}},
            },
        },
        "/stream": {"get": {"operationId": "stream_stream_get"}},
        "/mcp": {"post": {"operationId": "handle_mcp_mcp_post"}},
        "/{full_path}": {"get": {"operationId": "spa__full_path__get"}},
    },
    "components": {
        "schemas": {
            "SpoolBody": {
                "type": "object",
                "properties": {"brand": {"type": "string"}, "material": {"type": "string"}},
                "required": ["brand"],
            }
        }
    },
}


def find(name: str):
    return {tool.name: tool for tool in build_tool_definitions(OPENAPI)}[name]


def test_a_tool_is_named_after_its_operation_without_the_route_suffix() -> None:
    names = {tool.name for tool in build_tool_definitions(OPENAPI)}
    assert {"list_spools", "create_spool", "delete_spool", "cancel_print", "power_off"} <= names


def test_what_cannot_be_a_tool_is_left_out() -> None:
    names = {tool.name for tool in build_tool_definitions(OPENAPI)}
    assert "upload_file" not in names
    assert "stream_stream" not in names and "stream" not in names
    assert not any(name.startswith(("handle_mcp", "spa")) for name in names)


def test_the_description_is_the_summary_with_the_method_and_path() -> None:
    assert find("list_spools").description == "List Spools. (GET /api/spools)"


def test_query_parameters_become_properties() -> None:
    tool = find("list_spools")
    assert tool.input_schema["properties"]["limit"] == {"type": "integer"}
    assert tool.query_parameter_names == ("limit",)
    assert tool.input_schema["required"] == []


def test_the_body_fields_become_properties_and_keep_what_is_required() -> None:
    tool = find("create_spool")
    assert set(tool.input_schema["properties"]) == {"brand", "material"}
    assert tool.body_property_names == ("brand", "material")
    assert tool.input_schema["required"] == ["brand"]


def test_path_parameters_are_required() -> None:
    tool = find("delete_spool")
    assert tool.path_parameter_names == ("spool_id",)
    assert "spool_id" in tool.input_schema["required"]


def test_reading_needs_read_changing_needs_control_and_deleting_needs_admin() -> None:
    assert find("list_spools").required_scope == "read"
    assert find("create_spool").required_scope == "control"
    assert find("delete_spool").required_scope == "admin"


def test_cancelling_and_cutting_power_and_deleting_are_destructive_and_need_a_confirmation() -> None:
    for name in ("delete_spool", "cancel_print", "power_off"):
        tool = find(name)
        assert tool.is_destructive
        assert tool.input_schema["properties"]["confirm"]["type"] == "boolean"
        assert "confirm" in tool.input_schema["required"]
        assert "destructive" in tool.description.lower()
    assert not find("create_spool").is_destructive
    assert "confirm" not in find("create_spool").input_schema["properties"]
