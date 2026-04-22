import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import EvaluationEvent, EvaluationTemplate, Evaluator, EventPlayer, Player, Score
from app.schemas import EvaluatorLogin, ScoreBatchSubmit, ScoreResponse

router = APIRouter(prefix="/api", tags=["scoring"])


@router.post("/evaluators/login")
async def evaluator_login(data: EvaluatorLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Evaluator).where(Evaluator.access_code == data.access_code, Evaluator.active == True)
    )
    evaluator = result.scalar_one_or_none()
    if not evaluator:
        raise HTTPException(status_code=401, detail="Invalid access code")

    events_result = await db.execute(
        select(EvaluationEvent)
        .where(
            EvaluationEvent.organization_id == evaluator.organization_id,
            EvaluationEvent.status.in_(["active", "scoring"]),
        )
        .order_by(EvaluationEvent.event_date.desc().nullslast())
    )
    events = events_result.scalars().all()

    return {
        "evaluator": {
            "id": str(evaluator.id),
            "name": evaluator.name,
            "organization_id": str(evaluator.organization_id),
        },
        "events": [
            {
                "id": str(e.id),
                "name": e.name,
                "event_type": e.event_type,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "status": e.status,
            }
            for e in events
        ],
    }


@router.get("/scoring/event/{event_id}")
async def get_scoring_data(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    template = None
    if event.template_id:
        template = await db.get(EvaluationTemplate, event.template_id)

    ep_result = await db.execute(
        select(EventPlayer)
        .where(EventPlayer.event_id == event_id)
        .options(selectinload(EventPlayer.player))
    )
    event_players = ep_result.scalars().all()

    return {
        "event": {
            "id": str(event.id),
            "name": event.name,
            "event_type": event.event_type,
            "status": event.status,
            "settings": event.settings or {},
        },
        "template": {
            "id": str(template.id),
            "name": template.name,
            "skills": template.skills or [],
            "categories": template.categories or [],
        } if template else None,
        "players": [
            {
                "id": str(ep.player_id),
                "first_name": ep.player.first_name,
                "last_name": ep.player.last_name,
                "age_group": ep.player.age_group,
                "position": ep.player.position,
                "jersey_number": ep.player.jersey_number,
                "bib_number": ep.bib_number,
                "checked_in": ep.checked_in,
                "assigned_group": ep.assigned_group,
            }
            for ep in event_players
            if ep.player
        ],
    }


@router.post("/scoring/scores")
async def submit_scores(data: ScoreBatchSubmit, db: AsyncSession = Depends(get_db)):
    evaluator = await db.get(Evaluator, data.evaluator_id)
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found")

    event = await db.get(EvaluationEvent, data.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    saved = []
    for score_data in data.scores:
        # Update existing score or create new
        result = await db.execute(
            select(Score).where(
                Score.event_id == data.event_id,
                Score.player_id == score_data.player_id,
                Score.evaluator_id == data.evaluator_id,
                Score.skill_name == score_data.skill_name,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.score_value = score_data.score_value
            existing.comment = score_data.comment
            existing.video_url = score_data.video_url
            saved.append(existing)
        else:
            score = Score(
                id=uuid.uuid4(),
                event_id=data.event_id,
                player_id=score_data.player_id,
                evaluator_id=data.evaluator_id,
                skill_name=score_data.skill_name,
                score_value=score_data.score_value,
                comment=score_data.comment,
                video_url=score_data.video_url,
            )
            db.add(score)
            saved.append(score)

    await db.flush()
    return {"saved": len(saved)}


@router.get("/scoring/event/{event_id}/player/{player_id}", response_model=list[ScoreResponse])
async def get_player_scores(event_id: uuid.UUID, player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Score).where(Score.event_id == event_id, Score.player_id == player_id)
    )
    return result.scalars().all()
