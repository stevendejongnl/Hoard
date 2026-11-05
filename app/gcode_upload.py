"""G-code sent as text, for a client that cannot send a file: the name it gets on the printer and the text."""

from pathlib import PurePosixPath

from pydantic import BaseModel, Field, field_validator

MAX_TEXT_BYTES = 2 * 1024 * 1024
GCODE_SUFFIX = ".gcode"


def is_plain_gcode_name(name: str) -> bool:
    return (
        name.endswith(GCODE_SUFFIX)
        and name != GCODE_SUFFIX
        and PurePosixPath(name).name == name
        and "\\" not in name
        and not name.startswith(".")
    )


class GcodeUploadRequest(BaseModel):
    filename: str = Field(description="The name on the printer: it ends in .gcode and has no folder")
    content: str = Field(description="The whole G-code file as text, at most 2 MB")

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
