import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ChatThread, ChatMessage
from app.routers.auth import verify_admin_key

router = APIRouter(tags=["messaging"])


def _thread_dict(t):
    return {
        "id": str(t.id),
        "org_id": str(t.org_id),
        "thread_type": t.thread_type,
        "title": t.title,
        "participants": t.participants or [],
        "player_id": str(t.player_id) if t.player_id else None,
        "team_id": str(t.team_id) if t.team_id else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
    }


def _message_dict(m):
    return {
        "id": str(m.id),
        "thread_id": str(m.thread_id),
        "sender_name": m.sender_name,
        "sender_role": m.sender_role,
        "content": m.content,
        "attachments": m.attachments or [],
        "read_by": m.read_by or [],
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.post("/api/organizations/{org_id}/threads", dependencies=[Depends(verify_admin_key)])
async def create_thread(org_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    thread = ChatThread(
        id=uuid.uuid4(),
        org_id=org_id,
        thread_type=data.get("thread_type", "direct"),
        title=data.get("title"),
        participants=data.get("participants", []),
        player_id=data.get("player_id"),
        team_id=data.get("team_id"),
    )
    db.add(thread)
    await db.flush()
    await db.refresh(thread)
    return _thread_dict(thread)


@router.get("/api/organizations/{org_id}/threads", dependencies=[Depends(verify_admin_key)])
async def list_threads(
    org_id: uuid.UUID,
    thread_type: str = Query(None),
    participant_name: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatThread).where(ChatThread.org_id == org_id)
    if thread_type:
        query = query.where(ChatThread.thread_type == thread_type)
    query = query.order_by(ChatThread.last_message_at.desc().nullslast(), ChatThread.created_at.desc())
    result = await db.execute(query)
    threads = result.scalars().all()
    if participant_name:
        threads = [
            t for t in threads
            if any(p.get("name", "").lower() == participant_name.lower() for p in (t.participants or []))
        ]
    return [_thread_dict(t) for t in threads]


@router.get("/api/threads/{thread_id}/messages", dependencies=[Depends(verify_admin_key)])
async def get_thread_messages(thread_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return [_message_dict(m) for m in result.scalars().all()]


@router.post("/api/threads/{thread_id}/messages", dependencies=[Depends(verify_admin_key)])
async def send_message(thread_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    thread = await db.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    msg = ChatMessage(
        id=uuid.uuid4(),
        thread_id=thread_id,
        sender_name=data.get("sender_name"),
        sender_role=data.get("sender_role", "admin"),
        content=data.get("content"),
        attachments=data.get("attachments", []),
        read_by=data.get("read_by", []),
    )
    db.add(msg)
    thread.last_message_at = datetime.utcnow()
    await db.flush()
    await db.refresh(msg)
    return _message_dict(msg)


@router.get("/api/players/{player_id}/threads", dependencies=[Depends(verify_admin_key)])
async def get_player_threads(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatThread)
        .where(ChatThread.player_id == player_id)
        .order_by(ChatThread.last_message_at.desc().nullslast())
    )
    return [_thread_dict(t) for t in result.scalars().all()]


@router.get("/api/teams/{team_id}/thread", dependencies=[Depends(verify_admin_key)])
async def get_or_create_team_thread(team_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatThread).where(ChatThread.team_id == team_id, ChatThread.thread_type == "team")
    )
    thread = result.scalars().first()
    if not thread:
        thread = ChatThread(
            id=uuid.uuid4(),
            org_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
            thread_type="team",
            team_id=team_id,
            title="Team Chat",
            participants=[],
        )
        db.add(thread)
        await db.flush()
        await db.refresh(thread)
    return _thread_dict(thread)
