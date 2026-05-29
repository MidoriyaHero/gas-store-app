"""Mobile sync pull/push endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import SyncPullResponse, SyncPushIn, SyncPushResult
from app.services.sync_engine import apply_push, list_active_sales_order_ids, pull_changes

router = APIRouter(prefix="/sync", tags=["sync"], dependencies=[Depends(get_current_user)])


@router.get("/pull", response_model=SyncPullResponse)
def sync_pull(
    cursor: str | None = Query(default=None),
    entities: str | None = Query(default=None, description="Comma-separated entity groups"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SyncPullResponse:
    """Incremental read-only pull for offline cache refresh."""
    return pull_changes(db, user, cursor=cursor, entities=entities)


@router.post("/push", response_model=SyncPushResult)
def sync_push(
    mutation: SyncPushIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SyncPushResult:
    """Apply one queued offline mutation (serial ACID on server)."""
    return apply_push(db, user, mutation)


@router.get("/sales-order-ids")
def sync_sales_order_ids(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, list[int]]:
    """Active order ids for reconciling stale rows in the mobile SQLite cache."""
    return {"ids": list_active_sales_order_ids(db, user)}
