import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    TrainingProgram, ProgramWeek, ProgramSession,
    Player, PlayerReport, Score, EvaluationEvent,
)
from app.routers.auth import verify_admin_key
from app.services.ai import call_openai

router = APIRouter(tags=["training-programs"])


# ── helpers ──────────────────────────────────────────────────────
def _program_dict(p, include_weeks=False):
    d = {
        "id": str(p.id),
        "org_id": str(p.org_id),
        "player_id": str(p.player_id) if p.player_id else None,
        "template_name": p.template_name,
        "sport": p.sport,
        "duration_weeks": p.duration_weeks,
        "phase_name": p.phase_name,
        "status": p.status,
        "created_by": p.created_by,
        "ai_generated": p.ai_generated,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
    if include_weeks and hasattr(p, "weeks") and p.weeks:
        d["weeks"] = []
        for w in sorted(p.weeks, key=lambda x: x.week_number):
            wd = {
                "id": str(w.id),
                "week_number": w.week_number,
                "focus": w.focus,
                "notes": w.notes,
                "sessions": [],
            }
            if hasattr(w, "sessions") and w.sessions:
                days_order = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
                for s in sorted(w.sessions, key=lambda x: days_order.get(x.day_of_week, 9)):
                    wd["sessions"].append({
                        "id": str(s.id),
                        "day_of_week": s.day_of_week,
                        "session_type": s.session_type,
                        "exercises": s.exercises or [],
                    })
            d["weeks"].append(wd)
    return d


# ── CRUD ─────────────────────────────────────────────────────────
@router.post("/api/organizations/{org_id}/training-programs", dependencies=[Depends(verify_admin_key)])
async def create_program(org_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    data = await request.json()
    prog = TrainingProgram(
        id=uuid.uuid4(),
        org_id=org_id,
        player_id=data.get("player_id"),
        template_name=data.get("template_name"),
        sport=data.get("sport", "soccer"),
        duration_weeks=data.get("duration_weeks", 4),
        phase_name=data.get("phase_name"),
        status=data.get("status", "draft"),
        created_by=data.get("created_by"),
        ai_generated=False,
        notes=data.get("notes"),
    )
    db.add(prog)
    # add weeks if provided
    for w_data in data.get("weeks", []):
        week = ProgramWeek(
            id=uuid.uuid4(),
            program_id=prog.id,
            week_number=w_data.get("week_number", 1),
            focus=w_data.get("focus"),
            notes=w_data.get("notes"),
        )
        db.add(week)
        for s_data in w_data.get("sessions", []):
            sess = ProgramSession(
                id=uuid.uuid4(),
                week_id=week.id,
                day_of_week=s_data.get("day_of_week"),
                session_type=s_data.get("session_type"),
                exercises=s_data.get("exercises", []),
            )
            db.add(sess)
    await db.flush()
    await db.refresh(prog)
    return _program_dict(prog)


@router.get("/api/organizations/{org_id}/training-programs", dependencies=[Depends(verify_admin_key)])
async def list_programs(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingProgram)
        .where(TrainingProgram.org_id == org_id)
        .order_by(TrainingProgram.created_at.desc())
    )
    programs = result.scalars().all()
    items = []
    for p in programs:
        d = _program_dict(p)
        # Count how many player-assigned clones share this template name
        if not p.player_id and p.template_name:
            count_result = await db.execute(
                select(TrainingProgram)
                .where(
                    TrainingProgram.org_id == org_id,
                    TrainingProgram.template_name == p.template_name,
                    TrainingProgram.player_id.isnot(None),
                )
            )
            d["assigned_count"] = len(count_result.scalars().all())
        else:
            d["assigned_count"] = 1 if p.player_id else 0
        items.append(d)
    return items


@router.get("/api/training-programs/{program_id}", dependencies=[Depends(verify_admin_key)])
async def get_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingProgram)
        .options(selectinload(TrainingProgram.weeks).selectinload(ProgramWeek.sessions))
        .where(TrainingProgram.id == program_id)
    )
    prog = result.scalars().first()
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    d = _program_dict(prog, include_weeks=True)

    # Include assigned players list (clones sharing this template name)
    assigned_players = []
    if prog.template_name:
        clones_result = await db.execute(
            select(TrainingProgram)
            .where(
                TrainingProgram.org_id == prog.org_id,
                TrainingProgram.template_name == prog.template_name,
                TrainingProgram.player_id.isnot(None),
            )
        )
        for clone in clones_result.scalars().all():
            player = await db.get(Player, clone.player_id)
            if player:
                assigned_players.append({
                    "player_id": str(player.id),
                    "name": f"{player.first_name} {player.last_name}",
                    "position": player.position,
                    "age_group": player.age_group,
                })
    # Also include self if assigned
    if prog.player_id:
        player = await db.get(Player, prog.player_id)
        if player and not any(ap["player_id"] == str(prog.player_id) for ap in assigned_players):
            assigned_players.append({
                "player_id": str(player.id),
                "name": f"{player.first_name} {player.last_name}",
                "position": player.position,
                "age_group": player.age_group,
            })
    d["assigned_players"] = assigned_players
    return d


@router.patch("/api/training-programs/{program_id}", dependencies=[Depends(verify_admin_key)])
async def update_program(program_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    data = await request.json()
    prog = await db.get(TrainingProgram, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    for key in ("template_name", "sport", "duration_weeks", "phase_name", "status", "notes", "created_by"):
        if key in data:
            setattr(prog, key, data[key])

    # If weeks data is provided, replace all weeks/sessions
    if "weeks" in data:
        existing_weeks = await db.execute(
            select(ProgramWeek).where(ProgramWeek.program_id == program_id)
        )
        for w in existing_weeks.scalars().all():
            await db.delete(w)
        await db.flush()

        for w_data in data["weeks"]:
            week = ProgramWeek(
                id=uuid.uuid4(),
                program_id=program_id,
                week_number=w_data.get("week_number", 1),
                focus=w_data.get("focus"),
                notes=w_data.get("notes"),
            )
            db.add(week)
            for s_data in w_data.get("sessions", []):
                sess = ProgramSession(
                    id=uuid.uuid4(),
                    week_id=week.id,
                    day_of_week=s_data.get("day_of_week"),
                    session_type=s_data.get("session_type"),
                    exercises=s_data.get("exercises", []),
                )
                db.add(sess)
        prog.duration_weeks = len(data["weeks"])

    await db.flush()

    # Reload with weeks
    result = await db.execute(
        select(TrainingProgram)
        .options(selectinload(TrainingProgram.weeks).selectinload(ProgramWeek.sessions))
        .where(TrainingProgram.id == program_id)
    )
    prog = result.scalars().first()
    return _program_dict(prog, include_weeks=True)


@router.delete("/api/training-programs/{program_id}", dependencies=[Depends(verify_admin_key)])
async def delete_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    prog = await db.get(TrainingProgram, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    await db.delete(prog)
    return {"status": "deleted"}


@router.post("/api/training-programs/{program_id}/assign/{player_id}", dependencies=[Depends(verify_admin_key)])
async def assign_program(program_id: uuid.UUID, player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    prog = await db.get(TrainingProgram, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    prog.player_id = player_id
    prog.status = "active"
    await db.flush()
    await db.refresh(prog)
    return _program_dict(prog)


@router.post("/api/training-programs/{program_id}/assign", dependencies=[Depends(verify_admin_key)])
async def bulk_assign_program(program_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Clone a program template for each player in player_ids list."""
    data = await request.json()
    player_ids = data.get("player_ids", [])
    if not player_ids:
        raise HTTPException(status_code=400, detail="No player_ids provided")

    # Load source program with weeks
    result = await db.execute(
        select(TrainingProgram)
        .options(selectinload(TrainingProgram.weeks).selectinload(ProgramWeek.sessions))
        .where(TrainingProgram.id == program_id)
    )
    source = result.scalars().first()
    if not source:
        raise HTTPException(status_code=404, detail="Program not found")

    cloned = []
    for pid_str in player_ids:
        pid = uuid.UUID(pid_str) if isinstance(pid_str, str) else pid_str
        player = await db.get(Player, pid)
        if not player:
            continue

        clone = TrainingProgram(
            id=uuid.uuid4(),
            org_id=source.org_id,
            player_id=pid,
            template_name=source.template_name,
            sport=source.sport,
            duration_weeks=source.duration_weeks,
            phase_name=source.phase_name,
            status="active",
            created_by=source.created_by,
            ai_generated=source.ai_generated,
            notes=source.notes,
        )
        db.add(clone)

        if hasattr(source, "weeks") and source.weeks:
            for w in source.weeks:
                week = ProgramWeek(
                    id=uuid.uuid4(),
                    program_id=clone.id,
                    week_number=w.week_number,
                    focus=w.focus,
                    notes=w.notes,
                )
                db.add(week)
                if hasattr(w, "sessions") and w.sessions:
                    for s in w.sessions:
                        sess = ProgramSession(
                            id=uuid.uuid4(),
                            week_id=week.id,
                            day_of_week=s.day_of_week,
                            session_type=s.session_type,
                            exercises=s.exercises or [],
                        )
                        db.add(sess)
        cloned.append({"id": str(clone.id), "player_id": str(pid)})

    await db.flush()
    return {"assigned": len(cloned), "programs": cloned}


@router.get("/api/players/{player_id}/training-programs", dependencies=[Depends(verify_admin_key)])
async def get_player_programs(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingProgram)
        .options(selectinload(TrainingProgram.weeks).selectinload(ProgramWeek.sessions))
        .where(TrainingProgram.player_id == player_id)
        .order_by(TrainingProgram.created_at.desc())
    )
    return [_program_dict(p, include_weeks=True) for p in result.scalars().all()]


# ── AI Generation ────────────────────────────────────────────────
@router.post("/api/training-programs/{program_id}/ai-generate", dependencies=[Depends(verify_admin_key)])
async def ai_generate_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    prog = await db.get(TrainingProgram, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")

    # Gather player evaluation data if assigned
    player_context = ""
    if prog.player_id:
        player = await db.get(Player, prog.player_id)
        if player:
            player_context += f"Player: {player.first_name} {player.last_name}\n"
            player_context += f"Age Group: {player.age_group or 'Unknown'}\n"
            player_context += f"Position: {player.position or 'Unknown'}\n"

            # Get latest report for development plan and scores
            report_result = await db.execute(
                select(PlayerReport)
                .where(PlayerReport.player_id == prog.player_id)
                .order_by(PlayerReport.created_at.desc())
                .limit(1)
            )
            report = report_result.scalars().first()
            if report:
                if report.skill_scores:
                    player_context += f"Skill Scores: {json.dumps(report.skill_scores)}\n"
                if report.development_plan:
                    player_context += f"Development Plan: {json.dumps(report.development_plan)}\n"
                if report.ai_strengths:
                    player_context += f"Strengths: {json.dumps(report.ai_strengths)}\n"
                if report.ai_improvements:
                    player_context += f"Areas for Improvement: {json.dumps(report.ai_improvements)}\n"

    sport = prog.sport or "soccer"
    weeks = prog.duration_weeks or 4
    if weeks < 4:
        weeks = 4
    if weeks > 8:
        weeks = 8
    phase = prog.phase_name or "Pre-Season"

    prompt = f"""You are an expert youth {sport} training program designer.
Create a detailed {weeks}-week {phase} training program.

{player_context}

IMPORTANT: Use REAL {sport} training exercises. Each session must have 4-6 exercises.
Each exercise must include a "category" field from: warm-up, technical, tactical, physical, cool-down.

Exercise examples by category:
- warm-up: Dynamic stretching, Jog with ball, Rondo (4v1), High knees, Butt kicks, Lateral shuffles
- technical: Passing triangles, First touch wall passes, Shooting drills (inside/outside foot), Dribbling through cones, Juggling, Volleys, Headers, 1v1 finishing
- tactical: Small-sided games (4v4), Positional play exercises, Defensive shape drill, Pressing triggers, Overlapping runs, Counter-attack patterns, Set piece rehearsal
- physical: Agility ladder drills, Sprint intervals (10/20/30m), Box-to-box runs, Plyometric jumps, Core circuit, Single-leg squats, Resistance band work
- cool-down: Static stretching, Light jog, Foam rolling, Hip flexor stretch, Hamstring stretch

Each session should follow this structure: 1 warm-up, 2-3 technical/tactical, 1 physical, 1 cool-down.

Respond in this exact JSON format:
{{
    "weeks": [
        {{
            "week_number": 1,
            "focus": "Foundation & Assessment",
            "notes": "Focus on establishing baseline fitness",
            "sessions": [
                {{
                    "day_of_week": "Monday",
                    "session_type": "technical",
                    "exercises": [
                        {{
                            "name": "Dynamic Stretching Circuit",
                            "description": "Leg swings, arm circles, hip openers, walking lunges",
                            "sets": 1,
                            "reps_or_duration": "10 min",
                            "intensity": "low",
                            "category": "warm-up",
                            "rest_seconds": 0
                        }},
                        {{
                            "name": "Passing Triangles",
                            "description": "Groups of 3, two-touch passing in triangle formation, rotate positions",
                            "sets": 4,
                            "reps_or_duration": "3 min each",
                            "intensity": "moderate",
                            "category": "technical",
                            "rest_seconds": 60
                        }}
                    ]
                }}
            ]
        }}
    ]
}}

Create exactly {weeks} weeks with 3-4 sessions per week (e.g. Monday, Wednesday, Friday, optionally Saturday).
Session types should vary: technical, tactical, physical, recovery, match-prep.
Each session must have 4-6 exercises with real {sport}-specific drill names.
Progressive overload: increase intensity/complexity each week.
Tailor exercises to the player's age group, position, and development needs if player data is provided."""

    response_text = await call_openai(
        [{"role": "user", "content": prompt}],
        max_tokens=8000,
    )

    # Parse JSON
    try:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            program_data = json.loads(response_text[start:end])
        else:
            raise ValueError("No JSON found")
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=500, detail="AI generation failed to produce valid program data")

    # Clear existing weeks
    existing_weeks = await db.execute(
        select(ProgramWeek).where(ProgramWeek.program_id == program_id)
    )
    for w in existing_weeks.scalars().all():
        await db.delete(w)
    await db.flush()

    # Create new weeks from AI response
    for w_data in program_data.get("weeks", []):
        week = ProgramWeek(
            id=uuid.uuid4(),
            program_id=program_id,
            week_number=w_data.get("week_number", 1),
            focus=w_data.get("focus"),
            notes=w_data.get("notes"),
        )
        db.add(week)
        for s_data in w_data.get("sessions", []):
            sess = ProgramSession(
                id=uuid.uuid4(),
                week_id=week.id,
                day_of_week=s_data.get("day_of_week"),
                session_type=s_data.get("session_type"),
                exercises=s_data.get("exercises", []),
            )
            db.add(sess)

    prog.ai_generated = True
    prog.duration_weeks = len(program_data.get("weeks", []))
    await db.flush()

    # Reload with weeks
    result = await db.execute(
        select(TrainingProgram)
        .options(selectinload(TrainingProgram.weeks).selectinload(ProgramWeek.sessions))
        .where(TrainingProgram.id == program_id)
    )
    prog = result.scalars().first()
    return _program_dict(prog, include_weeks=True)
