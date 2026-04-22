import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import EvaluationEvent, EventPlayer, Organization, Player, PlayerReport, Score
from app.routers.auth import verify_admin_key

router = APIRouter(tags=["analytics"])


@router.get("/api/organizations/{org_id}/analytics", dependencies=[Depends(verify_admin_key)])
async def org_analytics(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    player_count = (await db.execute(
        select(func.count()).select_from(Player).where(Player.organization_id == org_id, Player.active == True)
    )).scalar()

    event_count = (await db.execute(
        select(func.count()).select_from(EvaluationEvent).where(EvaluationEvent.organization_id == org_id)
    )).scalar()

    score_count = (await db.execute(
        select(func.count()).select_from(Score)
        .join(EvaluationEvent)
        .where(EvaluationEvent.organization_id == org_id)
    )).scalar()

    recent_events = (await db.execute(
        select(EvaluationEvent)
        .where(EvaluationEvent.organization_id == org_id)
        .order_by(EvaluationEvent.created_at.desc())
        .limit(5)
    )).scalars().all()

    return {
        "total_players": player_count,
        "total_events": event_count,
        "total_evaluations": score_count,
        "recent_events": [
            {
                "id": str(e.id),
                "name": e.name,
                "event_type": e.event_type,
                "status": e.status,
                "event_date": e.event_date.isoformat() if e.event_date else None,
            }
            for e in recent_events
        ],
    }


@router.get("/api/events/{event_id}/analytics", dependencies=[Depends(verify_admin_key)])
async def event_analytics(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    player_count = (await db.execute(
        select(func.count()).select_from(EventPlayer).where(EventPlayer.event_id == event_id)
    )).scalar()

    score_count = (await db.execute(
        select(func.count()).select_from(Score).where(Score.event_id == event_id)
    )).scalar()

    evaluator_count = (await db.execute(
        select(func.count(func.distinct(Score.evaluator_id))).select_from(Score).where(Score.event_id == event_id)
    )).scalar()

    # Score distribution
    reports_result = await db.execute(
        select(PlayerReport).where(PlayerReport.event_id == event_id).order_by(PlayerReport.rank)
    )
    reports = reports_result.scalars().all()

    distribution = {"1.0-1.5": 0, "1.5-2.0": 0, "2.0-2.5": 0, "2.5-3.0": 0, "3.0-3.5": 0, "3.5-4.0": 0, "4.0-4.5": 0, "4.5-5.0": 0}
    for r in reports:
        if r.overall_score is not None:
            for bucket in distribution:
                low, high = map(float, bucket.split("-"))
                if low <= r.overall_score < high or (r.overall_score == 5.0 and bucket == "4.5-5.0"):
                    distribution[bucket] += 1
                    break

    avg_score = sum(r.overall_score for r in reports if r.overall_score) / max(len([r for r in reports if r.overall_score]), 1) if reports else None

    # Top performers — resolve player names
    player_ids = [r.player_id for r in reports[:10]]
    players_result = await db.execute(select(Player).where(Player.id.in_(player_ids)))
    player_map = {p.id: p for p in players_result.scalars().all()}
    
    top = [
        {
            "player_id": str(r.player_id),
            "player_name": f"{player_map[r.player_id].first_name} {player_map[r.player_id].last_name}" if r.player_id in player_map else "Unknown",
            "position": player_map[r.player_id].position if r.player_id in player_map else None,
            "age_group": player_map[r.player_id].age_group if r.player_id in player_map else None,
            "overall_score": r.overall_score,
            "rank": r.rank,
        }
        for r in reports[:10]
    ]

    # Skill averages
    skill_totals = defaultdict(list)
    for r in reports:
        if r.skill_scores:
            for skill, score in r.skill_scores.items():
                skill_totals[skill].append(score)

    skill_averages = {
        skill: round(sum(vals) / len(vals), 2)
        for skill, vals in skill_totals.items()
    }

    return {
        "total_players": player_count,
        "total_scores": score_count,
        "total_evaluators": evaluator_count,
        "avg_overall_score": round(avg_score, 2) if avg_score else None,
        "score_distribution": distribution,
        "top_performers": top,
        "skill_averages": skill_averages,
    }
