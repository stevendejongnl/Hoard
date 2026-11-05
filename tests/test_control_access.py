import pytest

from app.control_access import GRANT_SECONDS, REQUEST_SECONDS, ControlAccess


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class Announcements:
    def __init__(self) -> None:
        self.snapshots: list[dict] = []

    async def __call__(self, snapshot: dict) -> None:
        self.snapshots.append(snapshot)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def announcements() -> Announcements:
    return Announcements()


@pytest.fixture
def access(clock: Clock, announcements: Announcements) -> ControlAccess:
    return ControlAccess(clock=clock, announce=announcements)


async def test_nobody_may_control_the_printer_until_a_person_allows_it(access: ControlAccess):
    assert access.is_granted("claude") is False
    await access.request("claude", "I want to level the bed")
    assert access.is_granted("claude") is False


async def test_a_request_waits_for_the_person_and_says_what_it_is_for(access: ControlAccess):
    await access.request("claude", "I want to level the bed")
    pending = access.snapshot()["pending"]
    assert [(item["client"], item["reason"]) for item in pending] == [("claude", "I want to level the bed")]
    assert pending[0]["expires_at"] == 1000.0 + REQUEST_SECONDS


async def test_asking_again_does_not_make_a_second_request(access: ControlAccess):
    first = await access.request("claude", "one")
    second = await access.request("claude", "two")
    assert second["id"] == first["id"]
    assert len(access.snapshot()["pending"]) == 1


async def test_a_long_reason_is_cut(access: ControlAccess):
    request = await access.request("claude", "x" * 1000)
    assert len(request["reason"]) == 200


async def test_allowing_grants_the_client_for_a_while(access: ControlAccess, clock: Clock):
    request = await access.request("claude", "")
    assert await access.allow(request["id"]) is True
    assert access.is_granted("claude") is True
    assert access.snapshot()["pending"] == []
    assert access.snapshot()["granted"] == [{"client": "claude", "expires_at": 1000.0 + GRANT_SECONDS}]
    clock.now += GRANT_SECONDS - 1
    assert access.is_granted("claude") is True
    clock.now += 1
    assert access.is_granted("claude") is False
    assert access.snapshot()["granted"] == []


async def test_a_grant_belongs_to_one_client(access: ControlAccess):
    request = await access.request("claude", "")
    await access.allow(request["id"])
    assert access.is_granted("someone-else") is False


async def test_denying_removes_the_request_and_grants_nothing(access: ControlAccess):
    request = await access.request("claude", "")
    assert await access.deny(request["id"]) is True
    assert access.snapshot() == {"pending": [], "granted": []}
    assert access.is_granted("claude") is False


async def test_a_request_nobody_answers_expires(access: ControlAccess, clock: Clock):
    request = await access.request("claude", "")
    clock.now += REQUEST_SECONDS
    assert access.snapshot()["pending"] == []
    assert await access.allow(request["id"]) is False
    assert access.is_granted("claude") is False


async def test_an_unknown_request_cannot_be_allowed_or_denied(access: ControlAccess):
    assert await access.allow("nope") is False
    assert await access.deny("nope") is False


async def test_the_person_can_take_the_access_back(access: ControlAccess):
    request = await access.request("claude", "")
    await access.allow(request["id"])
    assert await access.revoke("claude") is True
    assert access.is_granted("claude") is False
    assert await access.revoke("claude") is False


async def test_a_client_that_already_has_access_is_not_asked_again(access: ControlAccess):
    request = await access.request("claude", "")
    await access.allow(request["id"])
    again = await access.request("claude", "more")
    assert again is None
    assert access.snapshot()["pending"] == []


async def test_every_change_is_announced_to_the_dashboard(access: ControlAccess, announcements: Announcements):
    request = await access.request("claude", "")
    await access.allow(request["id"])
    await access.revoke("claude")
    assert [len(snapshot["pending"]) for snapshot in announcements.snapshots] == [1, 0, 0]
    assert [len(snapshot["granted"]) for snapshot in announcements.snapshots] == [0, 1, 0]


async def test_the_state_of_a_client_says_where_it_stands(access: ControlAccess):
    assert access.find_state("claude") == "none"
    request = await access.request("claude", "")
    assert access.find_state("claude") == "waiting"
    await access.allow(request["id"])
    assert access.find_state("claude") == "granted"


async def test_a_denied_request_is_remembered_as_denied(access: ControlAccess):
    request = await access.request("claude", "")
    await access.deny(request["id"])
    assert access.find_state("claude") == "denied"
    assert access.find_state("someone-else") == "none"


async def test_access_that_was_taken_back_is_remembered_as_revoked(access: ControlAccess):
    request = await access.request("claude", "")
    await access.allow(request["id"])
    await access.revoke("claude")
    assert access.find_state("claude") == "revoked"


async def test_a_grant_that_ran_out_and_a_request_nobody_answered_are_told_apart(access: ControlAccess, clock: Clock):
    request = await access.request("claude", "")
    clock.now += REQUEST_SECONDS
    assert access.find_state("claude") == "unanswered"
    request = await access.request("claude", "")
    await access.allow(request["id"])
    clock.now += GRANT_SECONDS
    assert access.find_state("claude") == "ended"


async def test_asking_again_starts_over(access: ControlAccess):
    request = await access.request("claude", "")
    await access.deny(request["id"])
    await access.request("claude", "")
    assert access.find_state("claude") == "waiting"
