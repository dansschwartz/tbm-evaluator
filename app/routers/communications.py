"""Module 7: Communication Center"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Message, MessageRecipient, Player, Team, TeamRoster, Program
from app.routers.auth import verify_admin_key
from app.schemas import MessageCreate, MessageUpdate, MessageResponse, AIDraftMessageRequest
from app.services.ai import call_openai

router = APIRouter(tags=["Communications"], dependencies=[Depends(verify_admin_key)])

# Email templates
MESSAGE_TEMPLATES = {
    "weather_cancellation": {
        "name": "Weather Cancellation",
        "subject": "Practice/Game Cancelled Due to Weather",
        "body": "Dear Families,\n\nDue to weather conditions, all outdoor activities for [DATE] have been cancelled. Please check your email for updates on rescheduled activities.\n\nStay safe,\n[CLUB NAME]",
    },
    "season_kickoff": {
        "name": "Season Kickoff",
        "subject": "Welcome to [SEASON]!",
        "body": "Dear Families,\n\nWe're excited to welcome you to [SEASON]! Here are the important details you need to know:\n\n- First practice: [DATE]\n- Team assignments: [DETAILS]\n- What to bring: cleats, shin guards, water bottle\n\nLooking forward to a great season!\n[CLUB NAME]",
    },
    "tryout_reminder": {
        "name": "Tryout Reminder",
        "subject": "Reminder: Tryouts This Weekend",
        "body": "Dear Families,\n\nThis is a friendly reminder that tryouts are scheduled for [DATE] at [LOCATION].\n\nPlease arrive 15 minutes early for check-in. Players should bring:\n- Cleats and shin guards\n- Water bottle\n- Positive attitude!\n\nSee you there!\n[CLUB NAME]",
    },
    "schedule_update": {
        "name": "Schedule Update",
        "subject": "Schedule Update - Please Review",
        "body": "Dear Families,\n\nPlease note the following changes to the schedule:\n\n[CHANGES]\n\nUpdated schedules are available on the club website.\n\nThank you,\n[CLUB NAME]",
    },
    "end_of_season": {
        "name": "End of Season",
        "subject": "Thank You for a Great Season!",
        "body": "Dear Families,\n\nAs we wrap up [SEASON], we want to thank you for your dedication and support. It's been a wonderful season!\n\n[HIGHLIGHTS]\n\nWe hope to see you next season!\n[CLUB NAME]",
    },
}


@router.post("/api/organizations/{org_id}/messages", response_model=MessageResponse)
async def create_message(org_id: uuid.UUID, data: MessageCreate, db: AsyncSession = Depends(get_db)):
    msg = Message(org_id=org_id, **data.model_dump())
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)


@router.get("/api/organizations/{org_id}/messages")
async def list_messages(org_id: uuid.UUID, status: str = None, db: AsyncSession = Depends(get_db)):
    query = select(Message).where(Message.org_id == org_id)
    if status:
        query = query.where(Message.status == status)
    result = await db.execute(query.order_by(Message.created_at.desc()))
    return [MessageResponse.model_validate(m) for m in result.scalars().all()]


@router.get("/api/organizations/{org_id}/messages/templates")
async def get_message_templates(org_id: uuid.UUID):
    """Get reusable message templates."""
    return MESSAGE_TEMPLATES

@router.post("/api/organizations/{org_id}/messages/ai-draft")
async def ai_draft_message(org_id: uuid.UUID, req: AIDraftMessageRequest, db: AsyncSession = Depends(get_db)):
    """AI drafts a message."""
    prompt = f"""Draft a professional message for a youth sports club.

Audience: {req.audience}
Purpose: {req.purpose}
Tone: {req.tone}
Additional context: {req.context or 'None'}

Respond in JSON:
{{
    "subject": "email subject",
    "body": "plain text body",
    "body_html": "<html formatted body>"
}}

Be warm, parent-friendly, and clear."""

    try:
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=1500)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    return {
        "subject": req.purpose,
        "body": f"Dear {req.audience},\n\n{req.context or req.purpose}\n\nThank you,\nClub Administration",
        "body_html": f"<p>Dear {req.audience},</p><p>{req.context or req.purpose}</p><p>Thank you,<br>Club Administration</p>",
    }




@router.get("/api/organizations/{org_id}/messages/{message_id}", response_model=MessageResponse)
async def get_message(org_id: uuid.UUID, message_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(
        select(Message).where(Message.id == message_id, Message.org_id == org_id)
    )).scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found")
    return MessageResponse.model_validate(msg)


@router.patch("/api/organizations/{org_id}/messages/{message_id}", response_model=MessageResponse)
async def update_message(org_id: uuid.UUID, message_id: uuid.UUID, data: MessageUpdate, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(
        select(Message).where(Message.id == message_id, Message.org_id == org_id)
    )).scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.status == "sent":
        raise HTTPException(400, "Cannot edit a sent message")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(msg, key, val)
    await db.flush()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)


@router.post("/api/organizations/{org_id}/messages/{message_id}/send")
async def send_message(org_id: uuid.UUID, message_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Send a message to its audience. Creates recipient records."""
    msg = (await db.execute(
        select(Message).where(Message.id == message_id, Message.org_id == org_id)
    )).scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.status == "sent":
        raise HTTPException(400, "Message already sent")

    # Resolve audience to players
    players = []
    if msg.audience_type == "all":
        players = (await db.execute(
            select(Player).where(Player.organization_id == org_id, Player.active == True)
        )).scalars().all()
    elif msg.audience_type == "team" and msg.audience_filter:
        team_id = msg.audience_filter.get("team_id")
        if team_id:
            roster = (await db.execute(
                select(TeamRoster).where(TeamRoster.team_id == uuid.UUID(team_id), TeamRoster.status == "active")
            )).scalars().all()
            for entry in roster:
                player = (await db.execute(select(Player).where(Player.id == entry.player_id))).scalars().first()
                if player:
                    players.append(player)
    elif msg.audience_type == "program" and msg.audience_filter:
        program_id = msg.audience_filter.get("program_id")
        if program_id:
            teams = (await db.execute(
                select(Team).where(Team.program_id == uuid.UUID(program_id))
            )).scalars().all()
            for team in teams:
                roster = (await db.execute(
                    select(TeamRoster).where(TeamRoster.team_id == team.id, TeamRoster.status == "active")
                )).scalars().all()
                for entry in roster:
                    player = (await db.execute(select(Player).where(Player.id == entry.player_id))).scalars().first()
                    if player and player not in players:
                        players.append(player)
    elif msg.audience_type == "age_group" and msg.audience_filter:
        age_group = msg.audience_filter.get("age_group")
        if age_group:
            players = (await db.execute(
                select(Player).where(
                    Player.organization_id == org_id,
                    Player.active == True,
                    Player.age_group == age_group,
                )
            )).scalars().all()

    # Create recipient records
    recipient_count = 0
    for player in players:
        if player.parent_email:
            recipient = MessageRecipient(
                message_id=msg.id,
                player_id=player.id,
                parent_email=player.parent_email,
                parent_phone=player.parent_phone,
                delivery_status="sent",
                sent_at=datetime.utcnow(),
            )
            db.add(recipient)
            recipient_count += 1

    msg.status = "sent"
    msg.sent_at = datetime.utcnow()
    msg.recipient_count = recipient_count

    await db.flush()

    return {
        "message_id": str(msg.id),
        "status": "sent",
        "recipient_count": recipient_count,
    }



