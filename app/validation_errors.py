"""The text of a refused request: one sentence per problem, with the field and the limit, never the typed text."""

from collections.abc import Sequence
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

VALUE_ERROR_PREFIX = "Value error, "
LOCATION_PREFIXES = ("body", "query", "path")
RANGE_CHECKS = {
    "greater_than_equal": ("ge", "at least"),
    "greater_than": ("gt", "more than"),
    "less_than_equal": ("le", "at most"),
    "less_than": ("lt", "less than"),
}
NUMBER_TYPES = ("int_parsing", "float_parsing", "int_type", "float_type")


def name_field(location: tuple) -> str:
    return ".".join(str(part) for part in location if part not in LOCATION_PREFIXES)


def show_number(value: Any) -> str:
    return f"{value:g}" if isinstance(value, int | float) and not isinstance(value, bool) else ""


def describe_range(field: str, error: dict) -> str:
    key, words = RANGE_CHECKS[error["type"]]
    got = show_number(error.get("input"))
    return f"{field} must be {words} {error['ctx'][key]:g}" + (f" (got {got})" if got else "")


def describe_error(error: dict) -> str:
    field, kind = name_field(error["loc"]), error["type"]
    if kind in RANGE_CHECKS:
        return describe_range(field, error)
    if kind == "missing":
        return f"{field} is required"
    if kind == "literal_error":
        return f"{field} must be one of {error['ctx']['expected']}"
    if kind in NUMBER_TYPES:
        return f"{field} must be a number"
    if kind == "string_pattern_mismatch":
        return f"{field} has a form that is not allowed"
    message = error["msg"].removeprefix(VALUE_ERROR_PREFIX)
    return f"{field} {message}" if field else message


def explain_validation_errors(errors: Sequence[Any]) -> str:
    return "; ".join(describe_error(error) for error in errors) + "."


async def refuse_invalid_request(_request: Request, failure: Exception) -> JSONResponse:
    if not isinstance(failure, RequestValidationError):
        raise failure
    return JSONResponse({"detail": explain_validation_errors(failure.errors())}, status_code=422)
