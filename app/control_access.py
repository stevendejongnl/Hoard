"""Who may control the printer through MCP: a client asks, a person allows it on the dashboard, and it ends by itself."""

import asyncio
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Any

GRANT_SECONDS = 30 * 60
REQUEST_SECONDS = 30
ANSWER_POLL_SECONDS = 0.5
REASON_CHARACTERS = 200

Announce = Callable[[dict[str, Any]], Awaitable[None]]


async def announce_nothing(_snapshot: dict[str, Any]) -> None:
    return None


class ControlAccess:
    """Kept in memory on purpose: when Hoard restarts, every access has ended."""

    def __init__(
        self,
        clock: Callable[[], float] = time.time,
        announce: Announce = announce_nothing,
        new_identifier: Callable[[], str] = lambda: secrets.token_urlsafe(8),
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.clock = clock
        self.announce = announce
        self.new_identifier = new_identifier
        self.sleep = sleep
        self.pending: dict[str, dict[str, Any]] = {}
        self.granted: dict[str, float] = {}
        self.ended: dict[str, str] = {}

    def forget_what_ended(self) -> None:
        now = self.clock()
        for item in self.pending.values():
            if item["expires_at"] <= now:
                self.ended[item["client"]] = "unanswered"
        for client, expires_at in self.granted.items():
            if expires_at <= now:
                self.ended[client] = "ended"
        self.pending = {key: item for key, item in self.pending.items() if item["expires_at"] > now}
        self.granted = {client: expires_at for client, expires_at in self.granted.items() if expires_at > now}

    def find_state(self, client: str) -> str:
        """granted, waiting, or how it ended last (denied, revoked, ended, unanswered); none when never asked."""
        self.forget_what_ended()
        if client in self.granted:
            return "granted"
        if any(item["client"] == client for item in self.pending.values()):
            return "waiting"
        return self.ended.get(client, "none")

    async def wait_for_answer(self, client: str) -> str:
        """Waits while the request of the client is waiting; then how it stands (granted, denied, unanswered, ...)."""
        while self.find_state(client) == "waiting":
            await self.sleep(ANSWER_POLL_SECONDS)
        return self.find_state(client)

    def is_granted(self, client: str) -> bool:
        self.forget_what_ended()
        return client in self.granted

    def snapshot(self) -> dict[str, Any]:
        self.forget_what_ended()
        return {
            "pending": list(self.pending.values()),
            "granted": [{"client": client, "expires_at": at} for client, at in self.granted.items()],
        }

    async def request(self, client: str, reason: str) -> dict[str, Any] | None:
        """The waiting request of the client, or None when it already has access."""
        if self.is_granted(client):
            return None
        waiting = next((item for item in self.pending.values() if item["client"] == client), None)
        if waiting:
            return waiting
        item: dict[str, Any] = {
            "id": self.new_identifier(),
            "client": client,
            "reason": reason[:REASON_CHARACTERS],
            "expires_at": self.clock() + REQUEST_SECONDS,
        }
        self.pending[item["id"]] = item
        self.ended.pop(client, None)
        await self.announce(self.snapshot())
        return item

    async def allow(self, request_id: str) -> bool:
        self.forget_what_ended()
        item = self.pending.pop(request_id, None)
        if item is None:
            return False
        self.granted[item["client"]] = self.clock() + GRANT_SECONDS
        self.ended.pop(item["client"], None)
        await self.announce(self.snapshot())
        return True

    async def deny(self, request_id: str) -> bool:
        self.forget_what_ended()
        item = self.pending.pop(request_id, None)
        if item is None:
            return False
        self.ended[item["client"]] = "denied"
        await self.announce(self.snapshot())
        return True

    async def revoke(self, client: str) -> bool:
        self.forget_what_ended()
        if self.granted.pop(client, None) is None:
            return False
        self.ended[client] = "revoked"
        await self.announce(self.snapshot())
        return True


control_access = ControlAccess()
