import logging
import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import (
    EvaluationEvent,
    EvaluationTemplate,
    EventPlayer,
    Organization,
    Player,
    PlayerReport,
    Score,
)
from app.routers.auth import verify_admin_key
from app.schemas import ReportResponse
from app.services.ai import generate_player_summary

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reports"])


@router.post("/api/events/{event_id}/generate-reports", dependencies=[Depends(verify_admin_key)])
async def generate_reports(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate AI-powered evaluation reports for all players in an event.
    Uses weighted scoring from the template skills."""
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    org = await db.get(Organization, event.organization_id)
    template = await db.get(EvaluationTemplate, event.template_id) if event.template_id else None
    template_skills = template.skills if template else []

    # Build weight map from template (Feature 10: verify weighted calculations)
    weight_map = {}
    for skill in template_skills:
        weight_map[skill["name"]] = skill.get("weight", 1.0)

    # Get all event players
    ep_result = await db.execute(
        select(EventPlayer).where(EventPlayer.event_id == event_id)
    )
    event_players = ep_result.scalars().all()
    player_ids = [ep.player_id for ep in event_players]

    if not player_ids:
        raise HTTPException(status_code=400, detail="No players in this event")

    # Get all scores for this event
    scores_result = await db.execute(
        select(Score).where(Score.event_id == event_id)
    )
    all_scores = scores_result.scalars().all()

    # Group scores by player, then by skill (average across evaluators)
    player_skill_scores = defaultdict(lambda: defaultdict(list))
    for score in all_scores:
        player_skill_scores[score.player_id][score.skill_name].append(score.score_value)

    # Calculate averages and overall scores using WEIGHTED average
    player_overall = {}
    player_weighted_overall = {}
    player_skill_avg = {}

    for player_id in player_ids:
        skill_avgs = {}
        weighted_sum = 0
        total_weight = 0
        simple_sum = 0
        simple_count = 0

        for skill_name, values in player_skill_scores[player_id].items():
            avg = sum(values) / len(values)
            skill_avgs[skill_name] = round(avg, 2)
            weight = weight_map.get(skill_name, 1.0)
            weighted_sum += avg * weight
            total_weight += weight
            simple_sum += avg
            simple_count += 1

        weighted_overall = weighted_sum / total_weight if total_weight > 0 else 0
        simple_overall = simple_sum / simple_count if simple_count > 0 else 0

        player_weighted_overall[player_id] = round(weighted_overall, 2)
        player_overall[player_id] = round(simple_overall, 2)
        player_skill_avg[player_id] = skill_avgs

    # Rank players by WEIGHTED scores (Feature 10)
    ranked = sorted(player_ids, key=lambda pid: player_weighted_overall.get(pid, 0), reverse=True)
    rank_map = {pid: i + 1 for i, pid in enumerate(ranked)}
    total_players = len(ranked)

    # Generate reports
    reports_created = 0
    for player_id in player_ids:
        player = await db.get(Player, player_id)
        if not player:
            continue

        overall_score = player_overall.get(player_id, 0)
        weighted_score = player_weighted_overall.get(player_id, 0)
        skill_scores = player_skill_avg.get(player_id, {})
        rank = rank_map.get(player_id, 0)

        # Generate AI summary
        try:
            ai_result = await generate_player_summary(
                player_name=f"{player.first_name} {player.last_name}",
                age_group=player.age_group or "Unknown",
                event_name=event.name,
                sport=org.sport if org else "soccer",
                skill_scores=skill_scores,
                overall_score=weighted_score,
                rank=rank,
                total_players=total_players,
                template_skills=template_skills,
                position=player.position or "",
            )
        except Exception as e:
            logger.error(f"AI summary failed for player {player_id}: {e}")
            ai_result = {
                "summary": f"{player.first_name} {player.last_name} participated in {event.name}.",
                "strengths": [],
                "improvements": [],
                "recommendation": "Continue developing skills.",
            }

        # Check for existing report
        existing = await db.execute(
            select(PlayerReport).where(
                PlayerReport.event_id == event_id,
                PlayerReport.player_id == player_id,
            )
        )
        report = existing.scalar_one_or_none()

        report_id = report.id if report else uuid.uuid4()
        report_url = f"{settings.base_url}/report/{report_id}"

        if report:
            report.overall_score = overall_score
            report.weighted_overall_score = weighted_score
            report.skill_scores = skill_scores
            report.rank = rank
            report.total_players = total_players
            report.ai_summary = ai_result.get("summary", "")
            report.ai_strengths = ai_result.get("strengths", [])
            report.ai_improvements = ai_result.get("improvements", [])
            report.ai_recommendation = ai_result.get("recommendation", "")
            report.report_url = report_url
        else:
            report = PlayerReport(
                id=report_id,
                event_id=event_id,
                player_id=player_id,
                organization_id=event.organization_id,
                overall_score=overall_score,
                weighted_overall_score=weighted_score,
                skill_scores=skill_scores,
                rank=rank,
                total_players=total_players,
                ai_summary=ai_result.get("summary", ""),
                ai_strengths=ai_result.get("strengths", []),
                ai_improvements=ai_result.get("improvements", []),
                ai_recommendation=ai_result.get("recommendation", ""),
                report_url=report_url,
            )
            db.add(report)

        reports_created += 1

    await db.flush()

    # Update event status
    event.status = "completed"
    await db.flush()

    # Feature 17: Fire webhooks
    if org and org.webhook_url:
        from app.services.webhooks import fire_webhook
        await fire_webhook(org.webhook_url, "event.completed", {
            "event_id": str(event_id),
            "event_name": event.name,
            "reports_generated": reports_created,
        })
        await fire_webhook(org.webhook_url, "report.generated", {
            "event_id": str(event_id),
            "reports_count": reports_created,
        })

    return {"reports_generated": reports_created, "total_players": total_players}


@router.get("/api/events/{event_id}/reports", response_model=list[ReportResponse], dependencies=[Depends(verify_admin_key)])
async def list_event_reports(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """List all reports for an event, ordered by rank."""
    result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.event_id == event_id)
        .options(selectinload(PlayerReport.player))
        .order_by(PlayerReport.rank)
    )
    return result.scalars().all()


@router.get("/api/reports/{report_id}", response_model=ReportResponse, dependencies=[Depends(verify_admin_key)])
async def get_report(report_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a single report by ID (admin auth required)."""
    result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.id == report_id)
        .options(selectinload(PlayerReport.player))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/api/reports/{report_id}/public")
async def get_public_report(report_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a report for public viewing (no auth required). Includes self-assessment and previous evaluations."""
    result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.id == report_id)
        .options(selectinload(PlayerReport.player), selectinload(PlayerReport.event), selectinload(PlayerReport.organization))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Feature 2: Get previous evaluations for this player
    previous_reports = []
    if report.player:
        prev_result = await db.execute(
            select(PlayerReport)
            .where(PlayerReport.player_id == report.player_id, PlayerReport.id != report.id)
            .options(selectinload(PlayerReport.event))
            .order_by(PlayerReport.created_at.desc())
            .limit(10)
        )
        for pr in prev_result.scalars().all():
            previous_reports.append({
                "id": str(pr.id),
                "report_url": f"/report/{pr.id}",
                "event_name": pr.event.name if pr.event else "Unknown",
                "event_date": pr.event.event_date.isoformat() if pr.event and pr.event.event_date else None,
                "overall_score": pr.overall_score,
                "rank": pr.rank,
                "total_players": pr.total_players,
            })

    # Feature 12: Get self-assessment
    self_assessment = None
    if report.player and report.event:
        ep_result = await db.execute(
            select(EventPlayer).where(
                EventPlayer.event_id == report.event_id,
                EventPlayer.player_id == report.player_id,
            )
        )
        ep = ep_result.scalar_one_or_none()
        if ep and ep.self_assessment:
            self_assessment = ep.self_assessment

    # Get template for rubric data
    template_data = None
    if report.event and report.event.template_id:
        template = await db.get(EvaluationTemplate, report.event.template_id)
        if template:
            template_data = {
                "skills": template.skills or [],
                "categories": template.categories or [],
                "position_overrides": template.position_overrides,
            }

    return {
        "id": str(report.id),
        "player": {
            "first_name": report.player.first_name,
            "last_name": report.player.last_name,
            "age_group": report.player.age_group,
            "position": report.player.position,
            "photo_url": report.player.photo_url,
        } if report.player else None,
        "event": {
            "name": report.event.name,
            "event_date": report.event.event_date.isoformat() if report.event and report.event.event_date else None,
            "event_type": report.event.event_type if report.event else None,
            "season": report.event.season if report.event else None,
        } if report.event else None,
        "organization": {
            "name": report.organization.name,
            "logo_url": report.organization.logo_url,
            "primary_color": report.organization.primary_color,
            "secondary_color": report.organization.secondary_color,
        } if report.organization else None,
        "overall_score": report.overall_score,
        "weighted_overall_score": report.weighted_overall_score,
        "skill_scores": report.skill_scores,
        "rank": report.rank,
        "total_players": report.total_players,
        "ai_summary": report.ai_summary,
        "ai_strengths": report.ai_strengths,
        "ai_improvements": report.ai_improvements,
        "ai_recommendation": report.ai_recommendation,
        "ai_progress_narrative": report.ai_progress_narrative,
        "previous_reports": previous_reports,
        "self_assessment": self_assessment,
        "template": template_data,
        # Voice recordings (without audio_data for listing — use individual endpoint to play)
        "development_plan": report.development_plan,
        "voice_recordings": [
            {"id": r["id"], "label": r.get("label",""), "duration_seconds": r.get("duration_seconds",0),
             "evaluator_name": r.get("evaluator_name",""), "recorded_at": r.get("recorded_at","")}
            for r in (ep.voice_recordings or [])
        ] if ep else [],
    }
