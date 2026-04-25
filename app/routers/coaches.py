"""Module 8: Coach & Volunteer Management"""
import json
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Evaluator, Team
from app.routers.auth import verify_admin_key
from app.schemas import CertificationUpdate, AvailabilityUpdate, CoachAssignRequest
from app.services.ai import call_openai

router = APIRouter(tags=["Coach Management"], dependencies=[Depends(verify_admin_key)])


@router.patch("/api/evaluators/{evaluator_id}/certifications")
async def update_certifications(evaluator_id: uuid.UUID, data: CertificationUpdate, db: AsyncSession = Depends(get_db)):
    evaluator = (await db.execute(select(Evaluator).where(Evaluator.id == evaluator_id))).scalars().first()
    if not evaluator:
        raise HTTPException(404, "Evaluator not found")
    evaluator.certifications = data.certifications
    await db.flush()
    return {"evaluator_id": str(evaluator.id), "certifications": evaluator.certifications}


@router.patch("/api/evaluators/{evaluator_id}/availability")
async def update_availability(evaluator_id: uuid.UUID, data: AvailabilityUpdate, db: AsyncSession = Depends(get_db)):
    evaluator = (await db.execute(select(Evaluator).where(Evaluator.id == evaluator_id))).scalars().first()
    if not evaluator:
        raise HTTPException(404, "Evaluator not found")
    evaluator.availability = data.availability
    await db.flush()
    return {"evaluator_id": str(evaluator.id), "availability": evaluator.availability}


@router.get("/api/organizations/{org_id}/coaches")
async def list_coaches(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """List all coaches/evaluators with their extended info."""
    evaluators = (await db.execute(
        select(Evaluator).where(Evaluator.organization_id == org_id, Evaluator.active == True)
        .order_by(Evaluator.name)
    )).scalars().all()

    result = []
    for e in evaluators:
        # Find team assignments
        head_teams = (await db.execute(
            select(Team).where(Team.head_coach_id == e.id)
        )).scalars().all()

        result.append({
            "id": str(e.id),
            "name": e.name,
            "email": e.email,
            "phone": e.phone,
            "certifications": e.certifications or [],
            "background_check_status": e.background_check_status,
            "availability": e.availability or {},
            "volunteer_hours": e.volunteer_hours or 0,
            "team_assignments": [{"team_id": str(t.id), "team_name": t.name} for t in head_teams],
        })

    return result


@router.get("/api/organizations/{org_id}/coaches/expiring-certs")
async def expiring_certifications(org_id: uuid.UUID, days: int = 30, db: AsyncSession = Depends(get_db)):
    """List coaches with certifications expiring in the next N days."""
    evaluators = (await db.execute(
        select(Evaluator).where(Evaluator.organization_id == org_id, Evaluator.active == True)
    )).scalars().all()

    now = datetime.utcnow()
    cutoff = now + timedelta(days=days)
    expiring = []

    for e in evaluators:
        if not e.certifications:
            continue
        for cert in e.certifications:
            if cert.get("expiry"):
                try:
                    expiry = datetime.fromisoformat(cert["expiry"])
                    if expiry <= cutoff:
                        expiring.append({
                            "coach_id": str(e.id),
                            "coach_name": e.name,
                            "certification": cert["name"],
                            "expiry": cert["expiry"],
                            "expired": expiry <= now,
                            "days_until": max(0, (expiry - now).days),
                        })
                except (ValueError, TypeError):
                    pass

    expiring.sort(key=lambda x: x["days_until"])
    return expiring


@router.post("/api/organizations/{org_id}/coaches/ai-assign")
async def ai_assign_coaches(org_id: uuid.UUID, req: CoachAssignRequest, db: AsyncSession = Depends(get_db)):
    """AI assigns coaches to teams based on availability, experience, preferences."""
    coaches = (await db.execute(
        select(Evaluator).where(Evaluator.organization_id == org_id, Evaluator.active == True)
    )).scalars().all()

    teams = (await db.execute(
        select(Team).where(Team.id.in_(req.team_ids))
    )).scalars().all()

    coaches_info = []
    for c in coaches:
        head_count = (await db.execute(
            select(Team).where(Team.head_coach_id == c.id)
        )).scalars().all()
        coaches_info.append(
            f"- {c.name}: availability={c.availability}, certs={c.certifications}, "
            f"current_teams={len(head_count)}, hours={c.volunteer_hours}"
        )

    teams_info = [
        f"- {t.name}: level={t.team_level}, practice_day={t.practice_day}, practice_time={t.practice_time}"
        for t in teams
    ]

    prompt = f"""Assign coaches to teams optimally. Consider availability, experience, and workload balance.

Available Coaches:
{chr(10).join(coaches_info)}

Teams needing coaches:
{chr(10).join(teams_info)}

Respond in JSON:
{{
    "assignments": [{{"team_id": "...", "team_name": "...", "coach_id": "...", "coach_name": "...", "reason": "..."}}],
    "unassigned_teams": ["team names without available coaches"],
    "notes": ["recommendations"]
}}"""

    try:
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=1500)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    # Fallback: simple round-robin
    assignments = []
    available_coaches = [c for c in coaches if not (await db.execute(select(Team).where(Team.head_coach_id == c.id))).scalars().first()]

    for i, team in enumerate(teams):
        if i < len(available_coaches):
            assignments.append({
                "team_id": str(team.id),
                "team_name": team.name,
                "coach_id": str(available_coaches[i].id),
                "coach_name": available_coaches[i].name,
                "reason": "Round-robin assignment (AI unavailable)",
            })

    return {"assignments": assignments, "unassigned_teams": [], "notes": ["Fallback assignment used — AI was unavailable"]}
