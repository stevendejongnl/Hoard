import pytest

from app.mcp.api_request import ToolArgumentError, build_api_request
from app.mcp.catalog import ToolDefinition


def create_tool(**overrides) -> ToolDefinition:
    values = {
        "name": "update_spool",
        "description": "Update",
        "required_scope": "control",
        "method": "PATCH",
        "path": "/api/spools/{spool_id}",
        "input_schema": {"type": "object", "properties": {}, "required": ["spool_id"]},
        "path_parameter_names": ("spool_id",),
        "query_parameter_names": ("dry_run",),
        "body_property_names": ("brand", "notes"),
        "is_destructive": False,
    }
    return ToolDefinition(**{**values, **overrides})


def test_the_arguments_are_sorted_over_the_path_the_query_and_the_body() -> None:
    request = build_api_request(create_tool(), {"spool_id": 7, "dry_run": True, "brand": "Prusament"})
    assert request.method == "PATCH"
    assert request.path == "/api/spools/7"
    assert request.query == {"dry_run": True}
    assert request.body == {"brand": "Prusament"}


def test_a_path_value_cannot_climb_out_of_its_place() -> None:
    request = build_api_request(create_tool(), {"spool_id": "../../etc/passwd"})
    assert request.path == "/api/spools/..%2F..%2Fetc%2Fpasswd"


def test_no_body_is_sent_when_no_body_field_is_given() -> None:
    assert build_api_request(create_tool(), {"spool_id": 7}).body is None


def test_the_confirmation_is_not_passed_on_to_the_api() -> None:
    request = build_api_request(create_tool(), {"spool_id": 7, "confirm": True})
    assert request.body is None and request.query == {}


def test_a_missing_path_value_is_said() -> None:
    with pytest.raises(ToolArgumentError, match="spool_id"):
        build_api_request(create_tool(), {})


def test_an_unknown_argument_is_said_instead_of_dropped() -> None:
    with pytest.raises(ToolArgumentError, match="colour"):
        build_api_request(create_tool(), {"spool_id": 7, "colour": "red"})
