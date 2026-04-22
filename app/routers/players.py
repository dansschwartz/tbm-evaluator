import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Player, PlayerReport
from app.routers.auth import verify_admin_key
from app.schemas import PlayerCreate, PlayerResponse, PlayerUpdate

router = APIRouter(tags=["players"])


@router.post("/api/organizations/{org_id}/players", response_model=PlayerResponse, dependencies=[Depends(verify_admin_key)])
async def create_player(org_id: uuid.UUID, data: PlayerCreate, db: AsyncSession = Depends(get_db)):
    player_data = data.model_dump()
    metadata = player_data.pop("metadata", {})
    player = Player(id=uuid.uuid4(), organization_id=org_id, metadata_=metadata, **player_data)
    db.add(player)
    await db.flush()
    await db.refresh(player)
    return player


@router.post("/api/organizations/{org_id}/players/bulk", response_model=list[PlayerResponse], dependencies=[Depends(verify_admin_key)])
async def bulk_import_players(org_id: uuid.UUID, players: list[PlayerCreate], db: AsyncSession = Depends(get_db)):
    created = []
    for data in players:
        player_data = data.model_dump()
        metadata = player_data.pop("metadata", {})
        player = Player(id=uuid.uuid4(), organization_id=org_id, metadata_=metadata, **player_data)
        db.add(player)
        created.append(player)
    await db.flush()
    for p in created:
        await db.refresh(p)
    return created


@router.get("/api/organizations/{org_id}/players", response_model=list[PlayerResponse], dependencies=[Depends(verify_admin_key)])
async def list_players(
    org_id: uuid.UUID,
    age_group: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Player).where(Player.organization_id == org_id)
    if age_group:
        query = query.where(Player.age_group == age_group)
    if active is not None:
        query = query.where(Player.active == active)
    query = query.order_by(Player.last_name, Player.first_name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/api/players/{player_id}", response_model=dict, dependencies=[Depends(verify_admin_key)])
async def get_player(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    reports_result = await db.execute(
        select(PlayerReport).where(PlayerReport.player_id == player_id).order_by(PlayerReport.created_at.desc())
    )
    reports = reports_result.scalars().all()

    player_resp = PlayerResponse.model_validate(player)
    return {
        **player_resp.model_dump(),
        "evaluation_history": [
            {
                "id": str(r.id),
                "event_id": str(r.event_id),
                "overall_score": r.overall_score,
                "rank": r.rank,
                "total_players": r.total_players,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ],
    }


@router.patch("/api/players/{player_id}", response_model=PlayerResponse, dependencies=[Depends(verify_admin_key)])
async def update_player(player_id: uuid.UUID, data: PlayerUpdate, db: AsyncSession = Depends(get_db)):
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    update_data = data.model_dump(exclude_unset=True)
    metadata = update_data.pop("metadata", None)
    if metadata is not None:
        player.metadata_ = metadata
    for key, value in update_data.items():
        setattr(player, key, value)

    await db.flush()
    await db.refresh(player)
    return player


@router.delete("/api/players/{player_id}", dependencies=[Depends(verify_admin_key)])
async def delete_player(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    await db.delete(player)
    return {"status": "deleted"}
