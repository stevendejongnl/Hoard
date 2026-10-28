"""Who may use the MCP endpoint: clients with a scope, found by a bearer token that is stored only as a hash."""

import hashlib
import hmac
import secrets
from dataclasses import dataclass

SCOPES = ("read", "control", "admin")
TOKEN_PREFIX = "hoard_"
BEARER_PREFIX = "Bearer "


@dataclass(frozen=True)
class McpClient:
    name: str
    scope: str

    def allows(self, required_scope: str) -> bool:
        return SCOPES.index(self.scope) >= SCOPES.index(required_scope)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def parse_registered_client(entry: str) -> tuple[str, McpClient]:
    parts = entry.strip().split(":")
    if len(parts) != 3 or not all(parts):
        raise ValueError("an MCP client is written as name:scope:hash")
    name, scope, token_hash = parts
    if scope not in SCOPES:
        raise ValueError(f"the scope of an MCP client is one of {', '.join(SCOPES)}")
    return token_hash, McpClient(name=name, scope=scope)


def parse_registered_clients(text: str) -> dict[str, McpClient]:
    entries = [entry for entry in text.split(",") if entry.strip()]
    return dict(parse_registered_client(entry) for entry in entries)


def read_bearer_token(authorization_header: str | None) -> str | None:
    if not authorization_header or not authorization_header.startswith(BEARER_PREFIX):
        return None
    return authorization_header[len(BEARER_PREFIX) :].strip() or None


def find_client(authorization_header: str | None, registered: dict[str, McpClient]) -> McpClient | None:
    token = read_bearer_token(authorization_header)
    if token is None:
        return None
    token_hash = hash_token(token)
    matches = [client for known_hash, client in registered.items() if hmac.compare_digest(known_hash, token_hash)]
    return matches[0] if matches else None
