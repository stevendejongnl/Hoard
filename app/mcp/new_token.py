"""Makes a token for an MCP client: `python -m app.mcp.new_token NAME SCOPE`.

The token is printed once and is never stored. Give it to the client, and add the entry to MCP_CLIENTS (in `.env`, or
in the cluster secret). Removing the entry revokes the client.
"""

import sys

from app.mcp.tokens import SCOPES, generate_token, hash_token, parse_registered_client


def create_client_entry(name: str, scope: str) -> tuple[str, str]:
    token = generate_token()
    entry = f"{name}:{scope}:{hash_token(token)}"
    parse_registered_client(entry)
    return token, entry


def main(arguments: list[str]) -> int:
    if len(arguments) != 2:
        print(f"usage: python -m app.mcp.new_token NAME SCOPE   (scope is one of {', '.join(SCOPES)})")
        return 2
    token, entry = create_client_entry(*arguments)
    print(
        f"Token (shown once, give it to the client):\n{token}\n\nAdd this entry to MCP_CLIENTS, separated by commas:\n{entry}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
