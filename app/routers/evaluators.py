import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Evaluator
from app.routers.auth import verify_admin_key
from app.schemas import EvaluatorCreate, EvaluatorResponse

router = APIRouter(tags=["evaluators"])


def generate_access_code() -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(chars) for _ in range(6))


@router.post("/api/organizations/{org_id}/evaluators", response_model=EvaluatorResponse, dependencies=[Depends(verify_admin_key)])
async def create_evaluator(org_id: uuid.UUID, data: EvaluatorCreate, db: AsyncSession = Depends(get_db)):
    # Generate unique access code
    for _ in range(10):
        code = generate_access_code()
        existing = await db.execute(select(Evaluator).where(Evaluator.access_code == code))
        if not existing.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique access code")

    evaluator = Evaluator(
        id=uuid.uuid4(),
        organization_id=org_id,
        name=data.name,
        email=data.email,
        access_code=code,
    )
    db.add(evaluator)
    await db.flush()
    await db.refresh(evaluator)
    return evaluator


@router.get("/api/organizations/{org_id}/evaluators", response_model=list[EvaluatorResponse], dependencies=[Depends(verify_admin_key)])
async def list_evaluators(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Evaluator)
        .where(Evaluator.organization_id == org_id)
        .order_by(Evaluator.name)
    )
    return result.scalars().all()


@router.delete("/api/evaluators/{evaluator_id}", dependencies=[Depends(verify_admin_key)])
async def delete_evaluator(evaluator_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    evaluator = await db.get(Evaluator, evaluator_id)
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found")
    await db.delete(evaluator)
    return {"status": "deleted"}
