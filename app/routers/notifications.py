import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import EvaluationEvent, Organization, PlayerReport
from app.routers.auth import verify_admin_key
from app.services.email import build_report_email, send_email

router = APIRouter(tags=["notifications"])


@router.post("/api/events/{event_id}/send-reports", dependencies=[Depends(verify_admin_key)])
async def send_report_cards(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    org = await db.get(Organization, event.organization_id)

    result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.event_id == event_id)
        .options(selectinload(PlayerReport.player))
    )
    reports = result.scalars().all()

    sent_count = 0
    failed_count = 0

    for report in reports:
        if not report.player or not report.player.parent_email:
            continue

        report_url = report.report_url or f"{settings.base_url}/report/{report.id}"

        html = build_report_email(
            player_name=f"{report.player.first_name} {report.player.last_name}",
            event_name=event.name,
            org_name=org.name if org else "TBM Evaluator",
            report_url=report_url,
            overall_score=report.overall_score or 0,
            rank=report.rank or 0,
            total_players=report.total_players or 0,
            ai_summary=report.ai_summary or "",
            primary_color=org.primary_color if org else "#09A1A1",
        )

        success = send_email(
            to_email=report.player.parent_email,
            subject=f"Player Evaluation Report - {report.player.first_name} {report.player.last_name}",
            html_body=html,
        )

        if success:
            report.sent_to_parent = True
            report.sent_at = datetime.utcnow()
            sent_count += 1
        else:
            failed_count += 1

    await db.flush()
    return {"sent": sent_count, "failed": failed_count, "total": len(reports)}
