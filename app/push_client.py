import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

from pywebpush import WebPushException, webpush

from app.config import settings
from app.db import default_database

logger = logging.getLogger(__name__)

_GONE_STATUS_CODES = (404, 410)


class PushNotifier:
    """Sends web push messages to every stored subscription and removes the ones that are gone."""

    def __init__(
        self,
        database: Any = default_database,
        send_message: Callable[..., Any] = webpush,
        app_settings: Any = settings,
    ) -> None:
        self._database = database
        self._send_message = send_message
        self._settings = app_settings

    def vapid_public_key(self) -> str:
        return self._settings.vapid_public_key

    async def notify(self, title: str, body: str, url: str = "/") -> None:
        if not (self._settings.vapid_public_key and self._settings.vapid_private_key):
            return
        subscriptions = await self._database.get_push_subscriptions()
        payload = json.dumps({"title": title, "body": body, "url": url})
        for subscription in subscriptions:
            expired = await asyncio.to_thread(self._send, subscription, payload)
            if expired:
                await self._database.remove_push_subscription(subscription["endpoint"])

    def _send(self, subscription: dict, payload: str) -> bool:
        """Send one push message. Returns True if the subscription is dead
        (404/410 - the browser unsubscribed or the endpoint expired) and
        should be removed."""
        subscription_info = {
            "endpoint": subscription["endpoint"],
            "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
        }
        try:
            self._send_message(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=self._settings.vapid_private_key,
                vapid_claims={"sub": self._settings.vapid_subject},
            )
        except WebPushException as exc:
            return self._is_gone(subscription, exc)
        return False

    @staticmethod
    def _is_gone(subscription: dict, exc: WebPushException) -> bool:
        status = getattr(exc.response, "status_code", None)
        if status in _GONE_STATUS_CODES:
            return True
        logger.warning("push send failed for %s: %s", subscription["endpoint"], exc)
        return False


push_notifier = PushNotifier()


def vapid_public_key() -> str:
    return push_notifier.vapid_public_key()


async def notify(title: str, body: str, url: str = "/") -> None:
    await push_notifier.notify(title, body, url)
