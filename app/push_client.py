import asyncio
import json
import logging

from pywebpush import WebPushException, webpush

from app import db
from app.config import settings

logger = logging.getLogger(__name__)


def vapid_public_key() -> str:
    return settings.vapid_public_key


async def notify(title: str, body: str, url: str = "/") -> None:
    if not (settings.vapid_public_key and settings.vapid_private_key):
        return
    subscriptions = await db.get_push_subscriptions()
    payload = json.dumps({"title": title, "body": body, "url": url})
    for sub in subscriptions:
        expired = await asyncio.to_thread(_send, sub, payload)
        if expired:
            await db.remove_push_subscription(sub["endpoint"])


def _send(sub: dict, payload: str) -> bool:
    """Send one push message. Returns True if the subscription is dead
    (404/410 - the browser unsubscribed or the endpoint expired) and
    should be removed."""
    subscription_info = {
        "endpoint": sub["endpoint"],
        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            return True
        logger.warning("push send failed for %s: %s", sub["endpoint"], exc)
    return False
