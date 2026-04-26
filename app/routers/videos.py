import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PlayerVideo, Player, PlayerReport
from app.routers.auth import verify_admin_key
from app.services.ai import call_openai

router = APIRouter(tags=["videos"])


def _video_dict(v, include_data=False):
    d = {
        "id": str(v.id),
        "player_id": str(v.player_id),
        "org_id": str(v.org_id),
        "event_id": str(v.event_id) if v.event_id else None,
        "title": v.title,
        "description": v.description,
        "duration_seconds": v.duration_seconds,
        "tags": v.tags or [],
        "ai_analysis": v.ai_analysis,
        "uploaded_by": v.uploaded_by,
        "thumbnail_data": v.thumbnail_data,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }
    if include_data:
        d["video_data"] = v.video_data
    return d


@router.post("/api/players/{player_id}/videos", dependencies=[Depends(verify_admin_key)])
async def upload_video(player_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    video = PlayerVideo(
        id=uuid.uuid4(),
        player_id=player_id,
        org_id=player.organization_id,
        event_id=data.get("event_id"),
        title=data.get("title", "Untitled Video"),
        description=data.get("description"),
        video_data=data.get("video_data"),
        thumbnail_data=data.get("thumbnail_data"),
        duration_seconds=data.get("duration_seconds"),
        tags=data.get("tags", []),
        uploaded_by=data.get("uploaded_by"),
    )
    db.add(video)
    await db.flush()
    await db.refresh(video)
    return _video_dict(video)


@router.get("/api/players/{player_id}/videos", dependencies=[Depends(verify_admin_key)])
async def list_player_videos(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlayerVideo)
        .where(PlayerVideo.player_id == player_id)
        .order_by(PlayerVideo.created_at.desc())
    )
    return [_video_dict(v) for v in result.scalars().all()]


@router.get("/api/videos/{video_id}", dependencies=[Depends(verify_admin_key)])
async def get_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    video = await db.get(PlayerVideo, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return _video_dict(video)


@router.get("/api/videos/{video_id}/stream", dependencies=[Depends(verify_admin_key)])
async def stream_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    video = await db.get(PlayerVideo, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return _video_dict(video, include_data=True)


@router.delete("/api/videos/{video_id}", dependencies=[Depends(verify_admin_key)])
async def delete_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    video = await db.get(PlayerVideo, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    await db.delete(video)
    return {"status": "deleted"}


@router.post("/api/videos/{video_id}/ai-analyze", dependencies=[Depends(verify_admin_key)])
async def ai_analyze_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    video = await db.get(PlayerVideo, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Gather player context
    player = await db.get(Player, video.player_id)
    player_context = ""
    if player:
        player_context = f"Player: {player.first_name} {player.last_name}, Position: {player.position or 'Unknown'}, Age Group: {player.age_group or 'Unknown'}\n"

        report_result = await db.execute(
            select(PlayerReport)
            .where(PlayerReport.player_id == video.player_id)
            .order_by(PlayerReport.created_at.desc())
            .limit(1)
        )
        report = report_result.scalars().first()
        if report:
            if report.skill_scores:
                player_context += f"Recent Evaluation Scores: {json.dumps(report.skill_scores)}\n"
            if report.ai_strengths:
                player_context += f"Known Strengths: {json.dumps(report.ai_strengths)}\n"
            if report.ai_improvements:
                player_context += f"Areas to Improve: {json.dumps(report.ai_improvements)}\n"

    prompt = f"""You are an expert youth sports video analyst. Analyze this player's video session.

{player_context}
Video Title: {video.title or 'Untitled'}
Video Description: {video.description or 'No description'}
Duration: {video.duration_seconds or 'Unknown'} seconds
Tags: {', '.join(video.tags) if video.tags else 'None'}

Based on the player's known evaluation data and the video context, provide a detailed analysis including:
1. **Technical Assessment** - Ball control, passing accuracy, shooting technique, first touch
2. **Tactical Awareness** - Positioning, decision-making, spatial awareness
3. **Physical Performance** - Speed, agility, endurance observations
4. **Key Moments** - Notable plays, areas of excellence
5. **Development Recommendations** - Specific drills and focus areas

Provide the analysis as a detailed narrative that a coach or parent would find valuable."""

    analysis = await call_openai(
        [{"role": "user", "content": prompt}],
        max_tokens=2000,
    )

    video.ai_analysis = analysis
    await db.flush()
    await db.refresh(video)
    return _video_dict(video)
