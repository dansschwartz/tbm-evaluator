"""Module 6: AI Operations Assistant"""
import json
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Player, Team, TeamRoster, Field, FieldBooking, Season, Program,
    ScheduleEntry, Evaluator, AttendanceRecord, Message,
)
from app.routers.auth import verify_admin_key
from app.schemas import AIOpsAskRequest, AIEmailDraftRequest, AISeasonPlanRequest
from app.services.ai import call_openai

router = APIRouter(tags=["AI Operations"], dependencies=[Depends(verify_admin_key)])


async def gather_org_context(org_id: uuid.UUID, db: AsyncSession) -> str:
    """Gather operational data to feed to AI."""
    total_players = (await db.execute(
        select(func.count()).select_from(Player).where(Player.organization_id == org_id, Player.active == True)
    )).scalar() or 0

    total_teams = (await db.execute(
        select(func.count()).select_from(Team).where(Team.org_id == org_id)
    )).scalar() or 0

    total_fields = (await db.execute(
        select(func.count()).select_from(Field).where(Field.org_id == org_id, Field.active == True)
    )).scalar() or 0

    total_coaches = (await db.execute(
        select(func.count()).select_from(Evaluator).where(Evaluator.organization_id == org_id, Evaluator.active == True)
    )).scalar() or 0

    upcoming = (await db.execute(
        select(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.status == "scheduled",
            ScheduleEntry.start_time >= datetime.utcnow(),
        ).order_by(ScheduleEntry.start_time).limit(10)
    )).scalars().all()

    seasons = (await db.execute(
        select(Season).where(Season.org_id == org_id).order_by(Season.start_date.desc().nullslast()).limit(3)
    )).scalars().all()

    # Teams without coaches
    teams_no_coach = (await db.execute(
        select(Team).where(Team.org_id == org_id, Team.head_coach_id == None)
    )).scalars().all()

    context = f"""Organization Stats:
- Total active players: {total_players}
- Total teams: {total_teams}
- Total fields: {total_fields}
- Total coaches/evaluators: {total_coaches}
- Teams without head coach: {len(teams_no_coach)} ({', '.join(t.name for t in teams_no_coach[:5])})
- Recent seasons: {', '.join(s.name for s in seasons)}
- Upcoming events (next 10): {', '.join(f'{e.title} on {e.start_time}' for e in upcoming)}
"""
    return context


@router.post("/api/organizations/{org_id}/ai/ask")
async def ai_ask(org_id: uuid.UUID, req: AIOpsAskRequest, db: AsyncSession = Depends(get_db)):
    """Natural language queries about operations."""
    context = await gather_org_context(org_id, db)

    prompt = f"""You are an AI operations assistant for a youth sports club. Answer the question based on this data.

{context}

Question: {req.question}

If you can answer from the data, do so. If you need more specific data, say what you'd need.
Respond in JSON: {{"answer": "...", "data": {{...optional structured data}}, "suggestions": ["optional follow-up suggestions"]}}"""

    try:
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=1500)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    return {"answer": "I couldn't process that question. Try asking about teams, players, fields, or schedules.", "data": {}, "suggestions": []}


@router.get("/api/organizations/{org_id}/ai/alerts")
async def ai_alerts(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Proactive operational alerts."""
    alerts = []
    now = datetime.utcnow()

    # 1. Teams without coaches
    teams_no_coach = (await db.execute(
        select(Team).where(Team.org_id == org_id, Team.head_coach_id == None)
    )).scalars().all()
    for t in teams_no_coach:
        alerts.append({"severity": "warning", "category": "coaching", "message": f"Team '{t.name}' has no head coach assigned"})

    # 2. Expiring certifications (next 30 days)
    coaches = (await db.execute(
        select(Evaluator).where(Evaluator.organization_id == org_id, Evaluator.active == True)
    )).scalars().all()
    for coach in coaches:
        if coach.certifications:
            for cert in coach.certifications:
                if cert.get("expiry"):
                    try:
                        expiry = datetime.fromisoformat(cert["expiry"])
                        if expiry <= now + timedelta(days=30):
                            alerts.append({
                                "severity": "critical" if expiry <= now else "warning",
                                "category": "certification",
                                "message": f"{coach.name}'s {cert['name']} expires {cert['expiry']}",
                            })
                    except (ValueError, TypeError):
                        pass

    # 3. Field conflicts (next 7 days)
    upcoming_entries = (await db.execute(
        select(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.status == "scheduled",
            ScheduleEntry.start_time >= now,
            ScheduleEntry.start_time <= now + timedelta(days=7),
        ).order_by(ScheduleEntry.start_time)
    )).scalars().all()

    for i in range(len(upcoming_entries)):
        for j in range(i + 1, len(upcoming_entries)):
            a, b = upcoming_entries[i], upcoming_entries[j]
            if a.field_id and a.field_id == b.field_id:
                if a.start_time < b.end_time and a.end_time > b.start_time:
                    alerts.append({
                        "severity": "critical",
                        "category": "scheduling",
                        "message": f"Field conflict: '{a.title}' and '{b.title}' on {a.start_time.date()}",
                    })

    # 4. Low enrollment check - programs with few teams
    programs = (await db.execute(
        select(Program).where(Program.org_id == org_id)
    )).scalars().all()
    for prog in programs:
        team_count = (await db.execute(
            select(func.count()).select_from(Team).where(Team.program_id == prog.id)
        )).scalar() or 0
        if prog.max_teams and team_count < prog.max_teams * 0.3:
            alerts.append({
                "severity": "info",
                "category": "enrollment",
                "message": f"Program '{prog.name}' has low enrollment: {team_count}/{prog.max_teams} teams",
            })

    # 5. Empty rosters
    teams = (await db.execute(select(Team).where(Team.org_id == org_id))).scalars().all()
    for team in teams:
        roster_count = (await db.execute(
            select(func.count()).select_from(TeamRoster).where(
                TeamRoster.team_id == team.id, TeamRoster.status == "active"
            )
        )).scalar() or 0
        if roster_count == 0:
            alerts.append({
                "severity": "warning",
                "category": "roster",
                "message": f"Team '{team.name}' has an empty roster",
            })

    return {"alerts": alerts, "total": len(alerts)}


@router.post("/api/organizations/{org_id}/ai/season-plan")
async def ai_season_plan(org_id: uuid.UUID, req: AISeasonPlanRequest, db: AsyncSession = Depends(get_db)):
    """AI generates full season plan from inputs."""
    context = await gather_org_context(org_id, db)

    prompt = f"""You are a youth sports operations planner. Generate a comprehensive season plan.

Current org state:
{context}

Plan inputs:
- Season: {req.season_name}
- Age groups: {req.age_groups}
- Estimated players: {req.estimated_players}
- Available fields: {req.available_fields}
- Season length: {req.weeks} weeks

Generate a detailed plan in JSON:
{{
    "overview": "brief summary",
    "teams_plan": [{{"age_group": "...", "num_teams": N, "players_per": N}}],
    "schedule_plan": {{"games_per_team": N, "practices_per_week": N, "season_weeks": N}},
    "field_plan": [{{"field_slot": "Field A Mon 5-7pm", "assigned_to": "team/purpose"}}],
    "staffing_plan": {{"coaches_needed": N, "refs_needed": N, "volunteers_needed": N}},
    "timeline": [{{"week": "Week 1-2", "activities": ["activity"]}}],
    "budget_items": [{{"item": "...", "estimated_cost": "$X"}}],
    "risks_and_mitigations": [{{"risk": "...", "mitigation": "..."}}]
}}"""

    try:
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=2500)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    return {"overview": "AI planning unavailable", "teams_plan": [], "schedule_plan": {}, "field_plan": [], "staffing_plan": {}, "timeline": [], "budget_items": [], "risks_and_mitigations": []}


@router.post("/api/organizations/{org_id}/ai/email-draft")
async def ai_email_draft(org_id: uuid.UUID, req: AIEmailDraftRequest, db: AsyncSession = Depends(get_db)):
    """AI drafts a professional email."""
    prompt = f"""Draft a professional email for a youth sports club.

Audience: {req.audience}
Purpose: {req.purpose}
Context: {req.context or 'No additional context provided'}

Respond in JSON:
{{
    "subject": "email subject line",
    "body": "plain text email body",
    "body_html": "<html formatted email body>"
}}

Be warm, professional, and parent-friendly. Include specific details from the context."""

    try:
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=1500)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    return {
        "subject": f"[Youth Sports Club] {req.purpose}",
        "body": f"Dear {req.audience},\n\n{req.context}\n\nThank you,\nClub Administration",
        "body_html": f"<p>Dear {req.audience},</p><p>{req.context}</p><p>Thank you,<br>Club Administration</p>",
    }
