from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.control_access import ControlAccess
from app.routes.dependencies import provide_control_access

router = APIRouter(prefix="/api/control/access", tags=["control"])

Access = Annotated[ControlAccess, Depends(provide_control_access)]


def require_found(was_found: bool, message: str) -> dict:
    if not was_found:
        raise HTTPException(404, message)
    return {"ok": True}


@router.get("")
async def get_access(access: Access) -> dict:
    return access.snapshot()


@router.post("/{request_id}/allow")
async def allow_request(request_id: str, access: Access) -> dict:
    return require_found(await access.allow(request_id), "Request not found")


@router.post("/{request_id}/deny")
async def deny_request(request_id: str, access: Access) -> dict:
    return require_found(await access.deny(request_id), "Request not found")


@router.delete("/grants/{client}")
async def take_access_back(client: str, access: Access) -> dict:
    return require_found(await access.revoke(client), "Client has no access")
