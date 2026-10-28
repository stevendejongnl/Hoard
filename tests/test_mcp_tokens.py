import pytest

from app.mcp.tokens import McpClient, find_client, generate_token, hash_token, parse_registered_clients

READER_HASH = hash_token("reader-secret")
OPERATOR_HASH = hash_token("operator-secret")
REGISTERED_TEXT = f"laptop:read:{READER_HASH},claude:control:{OPERATOR_HASH}"


def test_a_token_hashes_to_the_same_hash_every_time_and_not_to_itself() -> None:
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != "abc"
    assert len(hash_token("abc")) == 64


def test_generated_tokens_differ_and_are_long_enough_to_guess_never() -> None:
    first, second = generate_token(), generate_token()
    assert first != second
    assert first.startswith("hoard_")
    assert len(first) >= 40


def test_registered_clients_come_from_name_scope_and_hash() -> None:
    registered = parse_registered_clients(REGISTERED_TEXT)
    assert registered == {
        READER_HASH: McpClient(name="laptop", scope="read"),
        OPERATOR_HASH: McpClient(name="claude", scope="control"),
    }


def test_nothing_is_registered_by_default() -> None:
    assert parse_registered_clients("") == {}
    assert parse_registered_clients("  ") == {}


@pytest.mark.parametrize("entry", ["laptop:read", "laptop:owner:abc", ":read:abc", "laptop:read:"])
def test_an_entry_that_is_wrong_stops_the_start_instead_of_being_skipped(entry: str) -> None:
    with pytest.raises(ValueError):
        parse_registered_clients(entry)


def test_the_client_is_found_by_its_bearer_token() -> None:
    registered = parse_registered_clients(REGISTERED_TEXT)
    assert find_client("Bearer operator-secret", registered) == McpClient(name="claude", scope="control")


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer wrong", "Basic operator-secret", "operator-secret"])
def test_no_client_is_found_without_a_right_bearer_token(header: str | None) -> None:
    assert find_client(header, parse_registered_clients(REGISTERED_TEXT)) is None


def test_a_scope_allows_its_own_level_and_the_levels_below() -> None:
    assert McpClient("a", "read").allows("read")
    assert not McpClient("a", "read").allows("control")
    assert McpClient("a", "control").allows("read")
    assert McpClient("a", "control").allows("control")
    assert not McpClient("a", "control").allows("admin")
    assert McpClient("a", "admin").allows("admin")
