from fastapi import APIRouter
from pydantic import BaseModel

from app import db, push_client

router = APIRouter(prefix="/api/push", tags=["push"])


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: dict[str, str]


class PushUnsubscribeIn(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
async def vapid_public_key() -> dict[str, str]:
    return {"key": push_client.vapid_public_key()}


@router.post("/subscribe")
async def subscribe(sub: PushSubscriptionIn) -> dict[str, str]:
    await db.add_push_subscription(sub.endpoint, sub.keys["p256dh"], sub.keys["auth"])
    return {"status": "ok"}


@router.post("/unsubscribe")
async def unsubscribe(sub: PushUnsubscribeIn) -> dict[str, str]:
    await db.remove_push_subscription(sub.endpoint)
    return {"status": "ok"}
