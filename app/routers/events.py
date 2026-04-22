import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import EvaluationEvent, EventPlayer, Player
from app.routers.auth import verify_admin_key
from app.schemas import EventCreate, EventPlayerAdd, EventPlayerResponse, EventResponse, EventUpdate

router = APIRouter(tags=["events"])


@router.post("/api/organizations/{org_id}/events", response_model=EventResponse, dependencies=[Depends(verify_admin_key)])
async def create_event(org_id: uuid.UUID, data: EventCreate, db: AsyncSession = Depends(get_db)):
    event = EvaluationEvent(id=uuid.uuid4(), organization_id=org_id, **data.model_dump())
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


@router.get("/api/organizations/{org_id}/events", response_model=list[EventResponse], dependencies=[Depends(verify_admin_key)])
async def list_events(org_id: uuid.UUID, season: str = None, db: AsyncSession = Depends(get_db)):
    """List events for an organization, optionally filtered by season."""
    query = select(EvaluationEvent).where(EvaluationEvent.organization_id == org_id)
    if season:
        query = query.where(EvaluationEvent.season == season)
    query = query.order_by(EvaluationEvent.event_date.desc().nullslast())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/api/events/{event_id}", response_model=dict, dependencies=[Depends(verify_admin_key)])
async def get_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    ep_result = await db.execute(
        select(EventPlayer)
        .where(EventPlayer.event_id == event_id)
        .options(selectinload(EventPlayer.player))
    )
    event_players = ep_result.scalars().all()

    event_resp = EventResponse.model_validate(event)
    return {
        **event_resp.model_dump(),
        "players": [
            {
                "id": str(ep.id),
                "player_id": str(ep.player_id),
                "checked_in": ep.checked_in,
                "bib_number": ep.bib_number,
                "assigned_group": ep.assigned_group,
                "first_name": ep.player.first_name if ep.player else None,
                "last_name": ep.player.last_name if ep.player else None,
                "age_group": ep.player.age_group if ep.player else None,
                "position": ep.player.position if ep.player else None,
                "jersey_number": ep.player.jersey_number if ep.player else None,
            }
            for ep in event_players
        ],
    }


@router.patch("/api/events/{event_id}", response_model=EventResponse, dependencies=[Depends(verify_admin_key)])
async def update_event(event_id: uuid.UUID, data: EventUpdate, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(event, key, value)

    await db.flush()
    await db.refresh(event)
    return event


@router.delete("/api/events/{event_id}", dependencies=[Depends(verify_admin_key)])
async def delete_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)
    return {"status": "deleted"}


@router.post("/api/events/{event_id}/players", dependencies=[Depends(verify_admin_key)])
async def add_players_to_event(event_id: uuid.UUID, data: EventPlayerAdd, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    added = []
    for pid in data.player_ids:
        existing = await db.execute(
            select(EventPlayer).where(EventPlayer.event_id == event_id, EventPlayer.player_id == pid)
        )
        if existing.scalar_one_or_none():
            continue
        ep = EventPlayer(id=uuid.uuid4(), event_id=event_id, player_id=pid)
        db.add(ep)
        added.append(str(pid))

    await db.flush()
    return {"added": len(added), "player_ids": added}


@router.delete("/api/events/{event_id}/players/{player_id}", dependencies=[Depends(verify_admin_key)])
async def remove_player_from_event(event_id: uuid.UUID, player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EventPlayer).where(EventPlayer.event_id == event_id, EventPlayer.player_id == player_id)
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in event")
    await db.delete(ep)
    return {"status": "removed"}


@router.post("/api/events/{event_id}/check-in/{player_id}", dependencies=[Depends(verify_admin_key)])
async def check_in_player(event_id: uuid.UUID, player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EventPlayer).where(EventPlayer.event_id == event_id, EventPlayer.player_id == player_id)
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in event")
    ep.checked_in = True
    from datetime import datetime
    ep.checked_in_at = datetime.utcnow()
    await db.flush()
    return {"status": "checked_in", "checked_in_at": ep.checked_in_at.isoformat()}
