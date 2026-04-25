"""Module 4: Advanced Team Management"""
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Team, TeamRoster, Player, PlayerReport, Field, FieldBooking
from app.routers.auth import verify_admin_key
from app.schemas import (
    TeamCreate, TeamUpdate, TeamResponse,
    TeamRosterAdd, TeamRosterResponse,
)
from app.services.ai import call_openai

router = APIRouter(tags=["Teams"], dependencies=[Depends(verify_admin_key)])


# --- Team CRUD ---
@router.post("/api/organizations/{org_id}/teams", response_model=TeamResponse)
async def create_team(org_id: uuid.UUID, data: TeamCreate, db: AsyncSession = Depends(get_db)):
    team = Team(org_id=org_id, **data.model_dump())
    db.add(team)
    await db.flush()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


@router.get("/api/organizations/{org_id}/teams")
async def list_teams(org_id: uuid.UUID, season_id: uuid.UUID = None, program_id: uuid.UUID = None, db: AsyncSession = Depends(get_db)):
    query = select(Team).where(Team.org_id == org_id)
    if season_id:
        query = query.where(Team.season_id == season_id)
    if program_id:
        query = query.where(Team.program_id == program_id)
    result = await db.execute(query.order_by(Team.name))
    return [TeamResponse.model_validate(t) for t in result.scalars().all()]


@router.get("/api/organizations/{org_id}/teams/{team_id}", response_model=TeamResponse)
async def get_team(org_id: uuid.UUID, team_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    team = (await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))).scalars().first()
    if not team:
        raise HTTPException(404, "Team not found")
    return TeamResponse.model_validate(team)


@router.patch("/api/organizations/{org_id}/teams/{team_id}", response_model=TeamResponse)
async def update_team(org_id: uuid.UUID, team_id: uuid.UUID, data: TeamUpdate, db: AsyncSession = Depends(get_db)):
    team = (await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))).scalars().first()
    if not team:
        raise HTTPException(404, "Team not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(team, key, val)
    await db.flush()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


@router.delete("/api/organizations/{org_id}/teams/{team_id}")
async def delete_team(org_id: uuid.UUID, team_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    team = (await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))).scalars().first()
    if not team:
        raise HTTPException(404, "Team not found")
    await db.delete(team)
    return {"deleted": True}


# --- Roster Management ---
@router.post("/api/teams/{team_id}/roster", response_model=TeamRosterResponse)
async def add_to_roster(team_id: uuid.UUID, data: TeamRosterAdd, db: AsyncSession = Depends(get_db)):
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalars().first()
    if not team:
        raise HTTPException(404, "Team not found")

    # Check max roster size
    if team.max_roster_size:
        current_count = (await db.execute(
            select(func.count()).select_from(TeamRoster).where(
                TeamRoster.team_id == team_id, TeamRoster.status == "active"
            )
        )).scalar() or 0
        if current_count >= team.max_roster_size:
            raise HTTPException(400, f"Team is full ({team.max_roster_size} players max)")

    # Check if player already on this team
    existing = (await db.execute(
        select(TeamRoster).where(
            TeamRoster.team_id == team_id,
            TeamRoster.player_id == data.player_id,
            TeamRoster.status == "active",
        )
    )).scalars().first()
    if existing:
        raise HTTPException(409, "Player already on this team")

    roster_entry = TeamRoster(
        team_id=team_id,
        player_id=data.player_id,
        jersey_number=data.jersey_number,
        role=data.role,
    )
    db.add(roster_entry)
    await db.flush()
    await db.refresh(roster_entry)
    return TeamRosterResponse.model_validate(roster_entry)


@router.get("/api/teams/{team_id}/roster")
async def get_roster(team_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeamRoster).where(TeamRoster.team_id == team_id, TeamRoster.status == "active")
        .order_by(TeamRoster.jersey_number.nullslast())
    )
    entries = result.scalars().all()

    roster = []
    for entry in entries:
        player = (await db.execute(select(Player).where(Player.id == entry.player_id))).scalars().first()
        roster.append({
            **TeamRosterResponse.model_validate(entry).model_dump(),
            "player_name": f"{player.first_name} {player.last_name}" if player else "Unknown",
            "position": player.position if player else None,
            "age_group": player.age_group if player else None,
        })
    return roster


@router.delete("/api/teams/{team_id}/roster/{player_id}")
async def remove_from_roster(team_id: uuid.UUID, player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(TeamRoster).where(
            TeamRoster.team_id == team_id,
            TeamRoster.player_id == player_id,
            TeamRoster.status == "active",
        )
    )).scalars().first()
    if not entry:
        raise HTTPException(404, "Player not on this team")
    entry.status = "released"
    return {"removed": True}


# --- AI Team Formation ---
@router.post("/api/organizations/{org_id}/teams/ai-form")
async def ai_form_teams(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """AI builds balanced teams from registered players + evaluation data."""
    num_teams = request.get("num_teams", 4)
    player_ids = request.get("player_ids", [])

    if not player_ids:
        # Get all active players
        players = (await db.execute(
            select(Player).where(Player.organization_id == org_id, Player.active == True)
        )).scalars().all()
    else:
        players = (await db.execute(
            select(Player).where(Player.id.in_([uuid.UUID(pid) if isinstance(pid, str) else pid for pid in player_ids]))
        )).scalars().all()

    if not players:
        raise HTTPException(400, "No players found")

    # Get latest report scores for each player
    player_data = []
    for player in players:
        report = (await db.execute(
            select(PlayerReport).where(PlayerReport.player_id == player.id)
            .order_by(PlayerReport.created_at.desc())
        )).scalars().first()

        player_data.append({
            "id": str(player.id),
            "name": f"{player.first_name} {player.last_name}",
            "position": player.position or "Unknown",
            "age_group": player.age_group or "Unknown",
            "overall_score": report.weighted_overall_score if report else 0,
        })

    # Sort by score descending for snake draft
    player_data.sort(key=lambda p: p["overall_score"], reverse=True)

    # Snake draft for balance
    teams = [{"team_number": i + 1, "players": [], "total_score": 0} for i in range(num_teams)]
    for round_num, player in enumerate(player_data):
        if round_num % 2 == 0:
            team_order = sorted(range(num_teams), key=lambda i: teams[i]["total_score"])
        else:
            team_order = sorted(range(num_teams), key=lambda i: teams[i]["total_score"], reverse=True)

        target = team_order[0]
        teams[target]["players"].append(player)
        teams[target]["total_score"] += player["overall_score"]

    for team in teams:
        team["avg_score"] = team["total_score"] / len(team["players"]) if team["players"] else 0

    return {"teams": teams, "method": "snake_draft_balanced"}


# --- Balance Check ---
@router.get("/api/organizations/{org_id}/teams/balance-check")
async def balance_check(org_id: uuid.UUID, season_id: uuid.UUID = None, db: AsyncSession = Depends(get_db)):
    """Check if all teams are balanced."""
    query = select(Team).where(Team.org_id == org_id)
    if season_id:
        query = query.where(Team.season_id == season_id)
    teams = (await db.execute(query)).scalars().all()

    team_stats = []
    for team in teams:
        roster_count = (await db.execute(
            select(func.count()).select_from(TeamRoster).where(
                TeamRoster.team_id == team.id, TeamRoster.status == "active"
            )
        )).scalar() or 0

        # Get avg score for roster
        roster_entries = (await db.execute(
            select(TeamRoster.player_id).where(
                TeamRoster.team_id == team.id, TeamRoster.status == "active"
            )
        )).scalars().all()

        avg_score = 0
        if roster_entries:
            scores = []
            for pid in roster_entries:
                report = (await db.execute(
                    select(PlayerReport).where(PlayerReport.player_id == pid)
                    .order_by(PlayerReport.created_at.desc())
                )).scalars().first()
                if report and report.weighted_overall_score:
                    scores.append(report.weighted_overall_score)
            if scores:
                avg_score = sum(scores) / len(scores)

        team_stats.append({
            "team_id": str(team.id),
            "team_name": team.name,
            "roster_size": roster_count,
            "avg_score": round(avg_score, 2),
        })

    max_size = max((t["roster_size"] for t in team_stats), default=0)
    min_size = min((t["roster_size"] for t in team_stats), default=0)
    max_score = max((t["avg_score"] for t in team_stats), default=0)
    min_score = min((t["avg_score"] for t in team_stats), default=0)

    return {
        "teams": team_stats,
        "size_spread": max_size - min_size,
        "score_spread": round(max_score - min_score, 2),
        "balanced": (max_size - min_size) <= 2 and (max_score - min_score) <= 0.5,
    }


# --- Practice Schedule ---
@router.post("/api/teams/{team_id}/practice-schedule")
async def assign_practice_schedule(team_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """Assign recurring practice slots."""
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalars().first()
    if not team:
        raise HTTPException(404, "Team not found")

    team.practice_day = request.get("day", team.practice_day)
    team.practice_time = request.get("time", team.practice_time)
    if request.get("field_id"):
        team.practice_field_id = uuid.UUID(request["field_id"]) if isinstance(request["field_id"], str) else request["field_id"]

    await db.flush()
    return {
        "team_id": str(team.id),
        "practice_day": team.practice_day,
        "practice_time": team.practice_time,
        "practice_field_id": str(team.practice_field_id) if team.practice_field_id else None,
    }
