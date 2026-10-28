"""Port numbers for the parity run, readable from the environment so several runs can go side by side."""

from collections.abc import Mapping

MINIMUM_PORT = 1
MAXIMUM_PORT = 65535


def parse_port(name: str, text: str) -> int:
    if not text.isdigit():
        raise ValueError(f"{name} must be a whole number, got {text!r}")
    port = int(text)
    if not MINIMUM_PORT <= port <= MAXIMUM_PORT:
        raise ValueError(f"{name} must be between {MINIMUM_PORT} and {MAXIMUM_PORT}, got {port}")
    return port


def read_port(environment: Mapping[str, str], name: str, default: int) -> int:
    text = environment.get(name, "")
    if text == "":
        return default
    return parse_port(name, text)
