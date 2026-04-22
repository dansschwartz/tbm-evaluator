import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import DraftPick, DraftTeam, EvaluationEvent, EventPlayer, Player, PlayerReport, Score
from app.routers.auth import verify_admin_key
from app.schemas import DraftPickCreate, DraftTeamCreate

router = APIRouter(tags=["draft"])


@router.post("/api/events/{event_id}/draft/teams", dependencies=[Depends(verify_admin_key)])
async def create_draft_teams(event_id: uuid.UUID, data: DraftTeamCreate, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Delete existing teams
    existing = await db.execute(select(DraftTeam).where(DraftTeam.event_id == event_id))
    for team in existing.scalars().all():
        await db.delete(team)
    await db.flush()

    teams = []
    colors = data.team_colors or []
    for i, name in enumerate(data.team_names):
        team = DraftTeam(
            id=uuid.uuid4(),
            event_id=event_id,
            team_name=name,
            team_color=colors[i] if i < len(colors) else None,
        )
        db.add(team)
        teams.append(team)

    await db.flush()
    return [
        {"id": str(t.id), "team_name": t.team_name, "team_color": t.team_color}
        for t in teams
    ]


@router.get("/api/events/{event_id}/draft", dependencies=[Depends(verify_admin_key)])
async def get_draft_state(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get teams with picks
    teams_result = await db.execute(
        select(DraftTeam)
        .where(DraftTeam.event_id == event_id)
        .options(selectinload(DraftTeam.picks).selectinload(DraftPick.player))
    )
    teams = teams_result.scalars().all()

    # Get drafted player IDs
    drafted_ids = set()
    for team in teams:
        for pick in team.picks:
            drafted_ids.add(pick.player_id)

    # Get all event players with their reports for rankings
    ep_result = await db.execute(
        select(EventPlayer)
        .where(EventPlayer.event_id == event_id)
        .options(selectinload(EventPlayer.player))
    )
    event_players = ep_result.scalars().all()

    # Get reports for ranking data
    reports_result = await db.execute(
        select(PlayerReport).where(PlayerReport.event_id == event_id)
    )
    reports = {r.player_id: r for r in reports_result.scalars().all()}

    available = []
    for ep in event_players:
        if ep.player_id not in drafted_ids and ep.player:
            report = reports.get(ep.player_id)
            available.append({
                "id": str(ep.player_id),
                "first_name": ep.player.first_name,
                "last_name": ep.player.last_name,
                "age_group": ep.player.age_group,
                "position": ep.player.position,
                "overall_score": report.overall_score if report else None,
                "rank": report.rank if report else None,
            })

    available.sort(key=lambda x: x.get("overall_score") or 0, reverse=True)

    return {
        "teams": [
            {
                "id": str(t.id),
                "team_name": t.team_name,
                "team_color": t.team_color,
                "picks": [
                    {
                        "id": str(p.id),
                        "player_id": str(p.player_id),
                        "pick_order": p.pick_order,
                        "first_name": p.player.first_name if p.player else None,
                        "last_name": p.player.last_name if p.player else None,
                        "position": p.player.position if p.player else None,
                        "overall_score": reports.get(p.player_id, None) and reports[p.player_id].overall_score,
                    }
                    for p in sorted(t.picks, key=lambda x: x.pick_order)
                ],
                "avg_score": (
                    sum(
                        reports[p.player_id].overall_score
                        for p in t.picks
                        if p.player_id in reports and reports[p.player_id].overall_score
                    ) / max(len([p for p in t.picks if p.player_id in reports]), 1)
                ) if t.picks else 0,
            }
            for t in teams
        ],
        "available_players": available,
    }


@router.post("/api/events/{event_id}/draft/pick", dependencies=[Depends(verify_admin_key)])
async def make_draft_pick(event_id: uuid.UUID, data: DraftPickCreate, db: AsyncSession = Depends(get_db)):
    team = await db.get(DraftTeam, data.team_id)
    if not team or team.event_id != event_id:
        raise HTTPException(status_code=404, detail="Team not found in this event")

    # Check not already drafted
    existing = await db.execute(
        select(DraftPick)
        .join(DraftTeam)
        .where(DraftTeam.event_id == event_id, DraftPick.player_id == data.player_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Player already drafted")

    # Get next pick order
    count_result = await db.execute(
        select(func.count()).select_from(DraftPick).where(DraftPick.draft_team_id == data.team_id)
    )
    pick_order = count_result.scalar() + 1

    pick = DraftPick(
        id=uuid.uuid4(),
        draft_team_id=data.team_id,
        player_id=data.player_id,
        pick_order=pick_order,
    )
    db.add(pick)
    await db.flush()
    return {"status": "picked", "pick_order": pick_order}


@router.post("/api/events/{event_id}/draft/auto-balance", dependencies=[Depends(verify_admin_key)])
async def auto_balance_teams(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get teams
    teams_result = await db.execute(select(DraftTeam).where(DraftTeam.event_id == event_id))
    teams = teams_result.scalars().all()
    if not teams:
        raise HTTPException(status_code=400, detail="Create teams first")

    # Clear existing picks
    for team in teams:
        picks_result = await db.execute(select(DraftPick).where(DraftPick.draft_team_id == team.id))
        for pick in picks_result.scalars().all():
            await db.delete(pick)
    await db.flush()

    # Get all players with reports
    ep_result = await db.execute(select(EventPlayer).where(EventPlayer.event_id == event_id))
    event_players = ep_result.scalars().all()

    reports_result = await db.execute(select(PlayerReport).where(PlayerReport.event_id == event_id))
    reports = {r.player_id: r for r in reports_result.scalars().all()}

    # Sort players by score descending
    players_sorted = sorted(
        event_players,
        key=lambda ep: reports.get(ep.player_id, None) and reports[ep.player_id].overall_score or 0,
        reverse=True,
    )

    # Snake draft for balance
    num_teams = len(teams)
    team_assignments = {t.id: [] for t in teams}
    team_list = list(teams)

    for i, ep in enumerate(players_sorted):
        # Snake: 0,1,2,...,n-1,n-1,...,1,0,0,1,...
        cycle = i // num_teams
        idx = i % num_teams
        if cycle % 2 == 1:
            idx = num_teams - 1 - idx
        team = team_list[idx]

        pick = DraftPick(
            id=uuid.uuid4(),
            draft_team_id=team.id,
            player_id=ep.player_id,
            pick_order=len(team_assignments[team.id]) + 1,
        )
        db.add(pick)
        team_assignments[team.id].append(ep.player_id)

    await db.flush()

    # Return summary
    result = []
    for team in teams:
        player_scores = [
            reports[pid].overall_score
            for pid in team_assignments[team.id]
            if pid in reports and reports[pid].overall_score
        ]
        result.append({
            "team_name": team.team_name,
            "player_count": len(team_assignments[team.id]),
            "avg_score": round(sum(player_scores) / len(player_scores), 2) if player_scores else 0,
        })

    return {"teams": result}


@router.get("/api/events/{event_id}/draft/export", dependencies=[Depends(verify_admin_key)])
async def export_draft(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    teams_result = await db.execute(
        select(DraftTeam)
        .where(DraftTeam.event_id == event_id)
        .options(selectinload(DraftTeam.picks).selectinload(DraftPick.player))
    )
    teams = teams_result.scalars().all()

    reports_result = await db.execute(select(PlayerReport).where(PlayerReport.event_id == event_id))
    reports = {r.player_id: r for r in reports_result.scalars().all()}

    return {
        "teams": [
            {
                "team_name": t.team_name,
                "team_color": t.team_color,
                "players": [
                    {
                        "first_name": p.player.first_name if p.player else "",
                        "last_name": p.player.last_name if p.player else "",
                        "position": p.player.position if p.player else "",
                        "age_group": p.player.age_group if p.player else "",
                        "overall_score": reports.get(p.player_id, None) and reports[p.player_id].overall_score,
                        "pick_order": p.pick_order,
                    }
                    for p in sorted(t.picks, key=lambda x: x.pick_order)
                ],
            }
            for t in teams
        ]
    }
