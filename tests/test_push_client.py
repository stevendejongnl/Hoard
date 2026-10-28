import json
from types import SimpleNamespace
from typing import Any

from pywebpush import WebPushException

from app import push_client


class FakeDatabase:
    def __init__(self, subscriptions: list[dict[str, str]]) -> None:
        self.subscriptions = subscriptions
        self.removed: list[str] = []

    async def get_push_subscriptions(self) -> list[dict[str, str]]:
        return self.subscriptions

    async def remove_push_subscription(self, endpoint: str) -> None:
        self.removed.append(endpoint)


class FakeSender:
    def __init__(self, failures: dict[str, Exception] | None = None) -> None:
        self.failures = failures or {}
        self.sent: list[dict[str, Any]] = []

    def __call__(self, **keywords: Any) -> None:
        self.sent.append(keywords)
        failure = self.failures.get(keywords["subscription_info"]["endpoint"])
        if failure:
            raise failure


def subscription(name: str) -> dict[str, str]:
    return {"endpoint": f"https://push/{name}", "p256dh": f"key-{name}", "auth": f"auth-{name}"}


KEYS = SimpleNamespace(vapid_public_key="public", vapid_private_key="private", vapid_subject="mailto:owner@example.org")
NO_KEYS = SimpleNamespace(vapid_public_key="", vapid_private_key="", vapid_subject="")


def failure_with_status(status: int | None) -> WebPushException:
    response = SimpleNamespace(status_code=status) if status is not None else None
    return WebPushException("failed", response=response)


def build_notifier(database: FakeDatabase, sender: FakeSender, app_settings: Any = KEYS) -> push_client.PushNotifier:
    return push_client.PushNotifier(database=database, send_message=sender, app_settings=app_settings)


async def test_every_subscription_gets_the_message_with_the_vapid_claims() -> None:
    database = FakeDatabase([subscription("a"), subscription("b")])
    sender = FakeSender()
    await build_notifier(database, sender).notify("Print complete", "benchy done", "/history")
    assert [call["subscription_info"] for call in sender.sent] == [
        {"endpoint": "https://push/a", "keys": {"p256dh": "key-a", "auth": "auth-a"}},
        {"endpoint": "https://push/b", "keys": {"p256dh": "key-b", "auth": "auth-b"}},
    ]
    assert json.loads(sender.sent[0]["data"]) == {"title": "Print complete", "body": "benchy done", "url": "/history"}
    assert sender.sent[0]["vapid_private_key"] == "private"
    assert sender.sent[0]["vapid_claims"] == {"sub": "mailto:owner@example.org"}
    assert database.removed == []


async def test_without_vapid_keys_nothing_is_sent() -> None:
    database = FakeDatabase([subscription("a")])
    sender = FakeSender()
    await build_notifier(database, sender, NO_KEYS).notify("t", "b")
    assert sender.sent == []


async def test_a_gone_subscription_is_removed_and_the_others_still_get_the_message() -> None:
    database = FakeDatabase([subscription("a"), subscription("b"), subscription("c")])
    sender = FakeSender({"https://push/a": failure_with_status(410), "https://push/b": failure_with_status(404)})
    await build_notifier(database, sender).notify("t", "b")
    assert len(sender.sent) == 3
    assert database.removed == ["https://push/a", "https://push/b"]


async def test_another_failure_keeps_the_subscription() -> None:
    database = FakeDatabase([subscription("a"), subscription("b")])
    sender = FakeSender({"https://push/a": failure_with_status(500), "https://push/b": failure_with_status(None)})
    await build_notifier(database, sender).notify("t", "b")
    assert database.removed == []


def test_the_public_key_comes_from_the_settings() -> None:
    assert build_notifier(FakeDatabase([]), FakeSender()).vapid_public_key() == "public"
