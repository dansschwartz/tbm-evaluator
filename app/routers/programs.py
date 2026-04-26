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
    return [_program_dict(p) for p in result.scalars().all()]


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
    return _program_dict(prog, include_weeks=True)


@router.patch("/api/training-programs/{program_id}", dependencies=[Depends(verify_admin_key)])
async def update_program(program_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    prog = await db.get(TrainingProgram, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    for key in ("template_name", "sport", "duration_weeks", "phase_name", "status", "notes", "created_by"):
        if key in data:
            setattr(prog, key, data[key])
    await db.flush()
    await db.refresh(prog)
    return _program_dict(prog)


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
    phase = prog.phase_name or "Pre-Season"

    prompt = f"""You are an expert youth {sport} training program designer.
Create a detailed {weeks}-week {phase} training program.

{player_context}

Design a program with specific exercises for each session. Include:
- Technical drills (ball control, passing, shooting for soccer)
- Tactical exercises (positioning, decision-making)
- Physical conditioning (speed, agility, strength)
- Recovery sessions

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
                    "session_type": "strength",
                    "exercises": [
                        {{"name": "Exercise Name", "sets": 3, "reps": "10", "intensity": "moderate", "notes": "Form focus"}}
                    ]
                }}
            ]
        }}
    ]
}}

Create {weeks} weeks with 4-5 sessions per week. Include strength, speed, skill, recovery, and game sessions.
Tailor exercises to the player's position and development needs if player data is provided."""

    response_text = await call_openai(
        [{"role": "user", "content": prompt}],
        max_tokens=4000,
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
