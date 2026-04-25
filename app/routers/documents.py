"""Module 11: Document Vault"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PlayerDocument, Player
from app.routers.auth import verify_admin_key
from app.schemas import PlayerDocumentCreate, PlayerDocumentResponse

router = APIRouter(tags=["Document Vault"], dependencies=[Depends(verify_admin_key)])

REQUIRED_DOCUMENT_TYPES = ["waiver", "medical", "birth_cert"]


@router.post("/api/players/{player_id}/documents", response_model=PlayerDocumentResponse)
async def upload_document(player_id: uuid.UUID, data: PlayerDocumentCreate, db: AsyncSession = Depends(get_db)):
    player = (await db.execute(select(Player).where(Player.id == player_id))).scalars().first()
    if not player:
        raise HTTPException(404, "Player not found")

    doc = PlayerDocument(
        player_id=player_id,
        org_id=player.organization_id,
        document_type=data.document_type,
        file_name=data.file_name,
        file_data=data.file_data,
        mime_type=data.mime_type,
        uploaded_by=data.uploaded_by,
        expires_at=data.expires_at,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    return PlayerDocumentResponse.model_validate(doc)


@router.get("/api/players/{player_id}/documents")
async def list_player_documents(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlayerDocument).where(PlayerDocument.player_id == player_id)
        .order_by(PlayerDocument.created_at.desc())
    )
    return [PlayerDocumentResponse.model_validate(d) for d in result.scalars().all()]


@router.get("/api/players/{player_id}/documents/{doc_id}")
async def get_document(player_id: uuid.UUID, doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get document including file data."""
    doc = (await db.execute(
        select(PlayerDocument).where(PlayerDocument.id == doc_id, PlayerDocument.player_id == player_id)
    )).scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")
    return {
        **PlayerDocumentResponse.model_validate(doc).model_dump(),
        "file_data": doc.file_data,
    }


@router.delete("/api/players/{player_id}/documents/{doc_id}")
async def delete_document(player_id: uuid.UUID, doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = (await db.execute(
        select(PlayerDocument).where(PlayerDocument.id == doc_id, PlayerDocument.player_id == player_id)
    )).scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.delete(doc)
    return {"deleted": True}


@router.patch("/api/players/{player_id}/documents/{doc_id}/verify")
async def verify_document(player_id: uuid.UUID, doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = (await db.execute(
        select(PlayerDocument).where(PlayerDocument.id == doc_id, PlayerDocument.player_id == player_id)
    )).scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.verified = True
    await db.flush()
    return {"verified": True}


@router.get("/api/organizations/{org_id}/documents/missing")
async def missing_documents(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """List players with missing required documents."""
    players = (await db.execute(
        select(Player).where(Player.organization_id == org_id, Player.active == True)
    )).scalars().all()

    missing = []
    for player in players:
        docs = (await db.execute(
            select(PlayerDocument).where(PlayerDocument.player_id == player.id)
        )).scalars().all()

        existing_types = {d.document_type for d in docs}
        missing_types = [t for t in REQUIRED_DOCUMENT_TYPES if t not in existing_types]

        if missing_types:
            missing.append({
                "player_id": str(player.id),
                "player_name": f"{player.first_name} {player.last_name}",
                "parent_email": player.parent_email,
                "missing_documents": missing_types,
            })

    return {"players_with_missing_docs": missing, "total": len(missing)}


@router.get("/api/organizations/{org_id}/documents/expiring")
async def expiring_documents(org_id: uuid.UUID, days: int = 30, db: AsyncSession = Depends(get_db)):
    """List documents expiring within N days."""
    now = datetime.utcnow()
    cutoff = now + timedelta(days=days)

    docs = (await db.execute(
        select(PlayerDocument).where(
            PlayerDocument.org_id == org_id,
            PlayerDocument.expires_at != None,
            PlayerDocument.expires_at <= cutoff,
        ).order_by(PlayerDocument.expires_at)
    )).scalars().all()

    result = []
    for doc in docs:
        player = (await db.execute(select(Player).where(Player.id == doc.player_id))).scalars().first()
        result.append({
            "document_id": str(doc.id),
            "player_id": str(doc.player_id),
            "player_name": f"{player.first_name} {player.last_name}" if player else "Unknown",
            "document_type": doc.document_type,
            "file_name": doc.file_name,
            "expires_at": str(doc.expires_at),
            "expired": doc.expires_at <= now,
            "days_until": max(0, (doc.expires_at - now).days),
        })

    return {"expiring_documents": result, "total": len(result)}
