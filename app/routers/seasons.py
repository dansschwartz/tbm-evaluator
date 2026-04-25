"""Module 3: Season & Program Management"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Season, Program, Team, Player, TeamRoster
from app.routers.auth import verify_admin_key
from app.schemas import (
    SeasonCreate, SeasonUpdate, SeasonResponse,
    ProgramCreate, ProgramUpdate, ProgramResponse,
)
from app.services.ai import call_openai

router = APIRouter(tags=["Seasons & Programs"], dependencies=[Depends(verify_admin_key)])


# --- Season CRUD ---
@router.post("/api/organizations/{org_id}/seasons", response_model=SeasonResponse)
async def create_season(org_id: uuid.UUID, data: SeasonCreate, db: AsyncSession = Depends(get_db)):
    season = Season(org_id=org_id, **data.model_dump())
    db.add(season)
    await db.flush()
    await db.refresh(season)
    return SeasonResponse.model_validate(season)


@router.get("/api/organizations/{org_id}/seasons")
async def list_seasons(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Season).where(Season.org_id == org_id).order_by(Season.start_date.desc().nullslast())
    )
    return [SeasonResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/api/organizations/{org_id}/seasons/{season_id}", response_model=SeasonResponse)
async def get_season(org_id: uuid.UUID, season_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    season = (await db.execute(
        select(Season).where(Season.id == season_id, Season.org_id == org_id)
    )).scalars().first()
    if not season:
        raise HTTPException(404, "Season not found")
    return SeasonResponse.model_validate(season)


@router.patch("/api/organizations/{org_id}/seasons/{season_id}", response_model=SeasonResponse)
async def update_season(org_id: uuid.UUID, season_id: uuid.UUID, data: SeasonUpdate, db: AsyncSession = Depends(get_db)):
    season = (await db.execute(
        select(Season).where(Season.id == season_id, Season.org_id == org_id)
    )).scalars().first()
    if not season:
        raise HTTPException(404, "Season not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(season, key, val)
    await db.flush()
    await db.refresh(season)
    return SeasonResponse.model_validate(season)


@router.delete("/api/organizations/{org_id}/seasons/{season_id}")
async def delete_season(org_id: uuid.UUID, season_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    season = (await db.execute(
        select(Season).where(Season.id == season_id, Season.org_id == org_id)
    )).scalars().first()
    if not season:
        raise HTTPException(404, "Season not found")
    await db.delete(season)
    return {"deleted": True}


# --- Program CRUD ---
@router.post("/api/organizations/{org_id}/programs", response_model=ProgramResponse)
async def create_program(org_id: uuid.UUID, data: ProgramCreate, db: AsyncSession = Depends(get_db)):
    program = Program(org_id=org_id, **data.model_dump())
    db.add(program)
    await db.flush()
    await db.refresh(program)
    return ProgramResponse.model_validate(program)


@router.get("/api/organizations/{org_id}/programs")
async def list_programs(org_id: uuid.UUID, season_id: uuid.UUID = None, db: AsyncSession = Depends(get_db)):
    query = select(Program).where(Program.org_id == org_id)
    if season_id:
        query = query.where(Program.season_id == season_id)
    result = await db.execute(query.order_by(Program.name))
    return [ProgramResponse.model_validate(p) for p in result.scalars().all()]


@router.get("/api/organizations/{org_id}/programs/{program_id}", response_model=ProgramResponse)
async def get_program(org_id: uuid.UUID, program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = (await db.execute(
        select(Program).where(Program.id == program_id, Program.org_id == org_id)
    )).scalars().first()
    if not program:
        raise HTTPException(404, "Program not found")
    return ProgramResponse.model_validate(program)


@router.patch("/api/organizations/{org_id}/programs/{program_id}", response_model=ProgramResponse)
async def update_program(org_id: uuid.UUID, program_id: uuid.UUID, data: ProgramUpdate, db: AsyncSession = Depends(get_db)):
    program = (await db.execute(
        select(Program).where(Program.id == program_id, Program.org_id == org_id)
    )).scalars().first()
    if not program:
        raise HTTPException(404, "Program not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(program, key, val)
    await db.flush()
    await db.refresh(program)
    return ProgramResponse.model_validate(program)


@router.delete("/api/organizations/{org_id}/programs/{program_id}")
async def delete_program(org_id: uuid.UUID, program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    program = (await db.execute(
        select(Program).where(Program.id == program_id, Program.org_id == org_id)
    )).scalars().first()
    if not program:
        raise HTTPException(404, "Program not found")
    await db.delete(program)
    return {"deleted": True}


# --- Season Dashboard ---
@router.get("/api/organizations/{org_id}/seasons/{season_id}/dashboard")
async def season_dashboard(org_id: uuid.UUID, season_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Overview stats for a season."""
    season = (await db.execute(
        select(Season).where(Season.id == season_id, Season.org_id == org_id)
    )).scalars().first()
    if not season:
        raise HTTPException(404, "Season not found")

    programs_count = (await db.execute(
        select(func.count()).select_from(Program).where(Program.season_id == season_id)
    )).scalar() or 0

    teams_count = (await db.execute(
        select(func.count()).select_from(Team).where(Team.season_id == season_id)
    )).scalar() or 0

    # Count players on rosters for this season's teams
    team_ids_q = select(Team.id).where(Team.season_id == season_id)
    players_count = (await db.execute(
        select(func.count()).select_from(TeamRoster).where(
            TeamRoster.team_id.in_(team_ids_q),
            TeamRoster.status == "active",
        )
    )).scalar() or 0

    return {
        "season": SeasonResponse.model_validate(season),
        "programs": programs_count,
        "teams": teams_count,
        "players_rostered": players_count,
    }


# --- AI Season Plan ---
@router.post("/api/organizations/{org_id}/seasons/{season_id}/ai-plan")
async def ai_season_plan(org_id: uuid.UUID, season_id: uuid.UUID, request: dict = {}, db: AsyncSession = Depends(get_db)):
    """AI generates recommended team counts, field needs, coach requirements."""
    season = (await db.execute(
        select(Season).where(Season.id == season_id, Season.org_id == org_id)
    )).scalars().first()
    if not season:
        raise HTTPException(404, "Season not found")

    programs = (await db.execute(
        select(Program).where(Program.season_id == season_id)
    )).scalars().all()

    total_players = (await db.execute(
        select(func.count()).select_from(Player).where(Player.organization_id == org_id, Player.active == True)
    )).scalar() or 0

    programs_info = [
        f"- {p.name}: type={p.program_type}, age_groups={p.age_groups}, max_per_team={p.max_players_per_team}, max_teams={p.max_teams}"
        for p in programs
    ]

    prompt = f"""You are a youth sports club operations planner. Generate a season plan.

Season: {season.name} ({season.start_date} to {season.end_date})
Total registered players: {total_players}
Programs:
{chr(10).join(programs_info) if programs_info else "No programs yet"}

Additional context: {request}

Respond in JSON:
{{
    "recommended_teams": [{{"program": "name", "count": N, "players_per_team": N}}],
    "field_needs": [{{"type": "practice/game", "sessions_per_week": N, "hours_per_session": N}}],
    "coach_requirements": {{"head_coaches": N, "assistants": N, "total_volunteer_hours": N}},
    "timeline": [{{"week": 1, "milestone": "description"}}],
    "budget_estimate": {{"fields": "$X", "equipment": "$X", "referees": "$X", "total": "$X"}},
    "risks": ["risk 1", "risk 2"]
}}"""

    try:
        import json
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=2000)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    return {
        "recommended_teams": [],
        "field_needs": [],
        "coach_requirements": {},
        "timeline": [],
        "budget_estimate": {},
        "risks": ["AI planning unavailable — please plan manually"],
    }
