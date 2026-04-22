import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Organization
from app.routers.auth import verify_admin_key
from app.schemas import OrganizationCreate, OrganizationResponse, OrganizationUpdate

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationResponse, dependencies=[Depends(verify_admin_key)])
async def create_organization(data: OrganizationCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Organization).where(Organization.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Organization slug already exists")

    org = Organization(
        id=uuid.uuid4(),
        api_key=secrets.token_urlsafe(32),
        **data.model_dump(),
    )
    db.add(org)
    await db.flush()
    await db.refresh(org)
    return org


@router.get("", response_model=list[OrganizationResponse], dependencies=[Depends(verify_admin_key)])
async def list_organizations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).order_by(Organization.created_at.desc()))
    return result.scalars().all()


@router.get("/{org_id}", response_model=OrganizationResponse, dependencies=[Depends(verify_admin_key)])
async def get_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/{org_id}", response_model=OrganizationResponse, dependencies=[Depends(verify_admin_key)])
async def update_organization(org_id: uuid.UUID, data: OrganizationUpdate, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(org, key, value)

    await db.flush()
    await db.refresh(org)
    return org


@router.delete("/{org_id}", dependencies=[Depends(verify_admin_key)])
async def delete_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    await db.delete(org)
    return {"status": "deleted"}
