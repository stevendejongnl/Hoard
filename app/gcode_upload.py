"""G-code sent as text, for a client that cannot send a file: the name it gets on the printer and the text."""

import hashlib
import re
from pathlib import PurePosixPath

from pydantic import BaseModel, Field, field_validator

MAX_TEXT_BYTES = 2 * 1024 * 1024
GCODE_SUFFIX = ".gcode"
SHA256_PATTERN = re.compile(r"[0-9a-fA-F]{64}")


def is_plain_gcode_name(name: str) -> bool:
    return (
        name.endswith(GCODE_SUFFIX)
        and name != GCODE_SUFFIX
        and PurePosixPath(name).name == name
        and "\\" not in name
        and not name.startswith(".")
    )


def fingerprint(content: bytes) -> str:
    """The SHA-256 of the bytes that are put on the printer, in lower case."""
    return hashlib.sha256(content).hexdigest()


class GcodeUploadRequest(BaseModel):
    filename: str = Field(description="The name on the printer: it ends in .gcode and has no folder")
    content: str = Field(description="The whole G-code file as text, at most 2 MB")
    expected_sha256: str | None = Field(
        default=None,
        description="The SHA-256 of the original file, worked out on the client; nothing is uploaded when it differs",
    )

    @field_validator("filename")
    @classmethod
    def be_a_plain_gcode_name(cls, value: str) -> str:
        if not is_plain_gcode_name(value):
            raise ValueError("must be a plain name that ends in .gcode, without a folder")
        return value

    @field_validator("content")
    @classmethod
    def be_text_of_a_sensible_size(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty")
        if len(value.encode()) > MAX_TEXT_BYTES:
            raise ValueError("must be at most 2 MB as text; upload a larger file from the dashboard")
        return value

    @field_validator("expected_sha256")
    @classmethod
    def be_a_sha256(cls, value: str | None) -> str | None:
        if value is not None and not SHA256_PATTERN.fullmatch(value):
            raise ValueError("must be 64 hexadecimal characters")
        return value
