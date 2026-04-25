"""Module 2: Field/Facility Management"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Field, FieldBooking
from app.routers.auth import verify_admin_key
from app.schemas import (
    FieldBookingCreate, FieldBookingResponse, FieldBookingUpdate,
    FieldCreate, FieldResponse, FieldUpdate,
)
from app.services.ai import call_openai

router = APIRouter(tags=["Fields & Facilities"], dependencies=[Depends(verify_admin_key)])


# --- Field CRUD ---
@router.post("/api/organizations/{org_id}/fields", response_model=FieldResponse)
async def create_field(org_id: uuid.UUID, data: FieldCreate, db: AsyncSession = Depends(get_db)):
    field = Field(org_id=org_id, **data.model_dump())
    db.add(field)
    await db.flush()
    await db.refresh(field)
    return FieldResponse.model_validate(field)


@router.get("/api/organizations/{org_id}/fields")
async def list_fields(org_id: uuid.UUID, active: bool = True, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Field).where(Field.org_id == org_id, Field.active == active).order_by(Field.name)
    )
    return [FieldResponse.model_validate(f) for f in result.scalars().all()]


@router.get("/api/organizations/{org_id}/fields/{field_id}", response_model=FieldResponse)
async def get_field(org_id: uuid.UUID, field_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    field = (await db.execute(select(Field).where(Field.id == field_id, Field.org_id == org_id))).scalars().first()
    if not field:
        raise HTTPException(404, "Field not found")
    return FieldResponse.model_validate(field)


@router.patch("/api/organizations/{org_id}/fields/{field_id}", response_model=FieldResponse)
async def update_field(org_id: uuid.UUID, field_id: uuid.UUID, data: FieldUpdate, db: AsyncSession = Depends(get_db)):
    field = (await db.execute(select(Field).where(Field.id == field_id, Field.org_id == org_id))).scalars().first()
    if not field:
        raise HTTPException(404, "Field not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(field, key, val)
    await db.flush()
    await db.refresh(field)
    return FieldResponse.model_validate(field)


@router.delete("/api/organizations/{org_id}/fields/{field_id}")
async def delete_field(org_id: uuid.UUID, field_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    field = (await db.execute(select(Field).where(Field.id == field_id, Field.org_id == org_id))).scalars().first()
    if not field:
        raise HTTPException(404, "Field not found")
    await db.delete(field)
    return {"deleted": True}


# --- Booking CRUD ---
@router.post("/api/fields/{field_id}/bookings", response_model=FieldBookingResponse)
async def create_booking(field_id: uuid.UUID, data: FieldBookingCreate, db: AsyncSession = Depends(get_db)):
    field = (await db.execute(select(Field).where(Field.id == field_id))).scalars().first()
    if not field:
        raise HTTPException(404, "Field not found")

    # Check for conflicts
    conflicts = await db.execute(
        select(FieldBooking).where(
            FieldBooking.field_id == field_id,
            FieldBooking.status != "cancelled",
            FieldBooking.start_time < data.end_time,
            FieldBooking.end_time > data.start_time,
        )
    )
    if conflicts.scalars().first():
        raise HTTPException(409, "Time slot conflicts with existing booking")

    booking = FieldBooking(field_id=field_id, **data.model_dump())
    db.add(booking)
    await db.flush()
    await db.refresh(booking)
    return FieldBookingResponse.model_validate(booking)


@router.get("/api/fields/{field_id}/bookings")
async def list_bookings(field_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FieldBooking).where(FieldBooking.field_id == field_id).order_by(FieldBooking.start_time)
    )
    return [FieldBookingResponse.model_validate(b) for b in result.scalars().all()]


@router.patch("/api/fields/{field_id}/bookings/{booking_id}", response_model=FieldBookingResponse)
async def update_booking(field_id: uuid.UUID, booking_id: uuid.UUID, data: FieldBookingUpdate, db: AsyncSession = Depends(get_db)):
    booking = (await db.execute(
        select(FieldBooking).where(FieldBooking.id == booking_id, FieldBooking.field_id == field_id)
    )).scalars().first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(booking, key, val)
    await db.flush()
    await db.refresh(booking)
    return FieldBookingResponse.model_validate(booking)


@router.delete("/api/fields/{field_id}/bookings/{booking_id}")
async def delete_booking(field_id: uuid.UUID, booking_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    booking = (await db.execute(
        select(FieldBooking).where(FieldBooking.id == booking_id, FieldBooking.field_id == field_id)
    )).scalars().first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    await db.delete(booking)
    return {"deleted": True}


# --- Availability Search ---
@router.get("/api/organizations/{org_id}/fields/availability")
async def find_available_fields(
    org_id: uuid.UUID,
    date: str,
    start: str = "16:00",
    end: str = "20:00",
    size: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Find available fields for a given date/time window."""
    start_dt = datetime.fromisoformat(f"{date}T{start}:00")
    end_dt = datetime.fromisoformat(f"{date}T{end}:00")

    query = select(Field).where(Field.org_id == org_id, Field.active == True)
    if size:
        query = query.where(Field.size == size)
    fields = (await db.execute(query)).scalars().all()

    available = []
    for field in fields:
        conflicts = await db.execute(
            select(FieldBooking).where(
                FieldBooking.field_id == field.id,
                FieldBooking.status != "cancelled",
                FieldBooking.start_time < end_dt,
                FieldBooking.end_time > start_dt,
            )
        )
        if not conflicts.scalars().first():
            available.append(FieldResponse.model_validate(field))

    return available


# --- Weekly Calendar ---
@router.get("/api/organizations/{org_id}/fields/calendar")
async def field_calendar(org_id: uuid.UUID, week: str, db: AsyncSession = Depends(get_db)):
    """Get weekly calendar of all field bookings."""
    week_start = datetime.fromisoformat(f"{week}T00:00:00")
    week_end = week_start + timedelta(days=7)

    fields = (await db.execute(
        select(Field).where(Field.org_id == org_id, Field.active == True)
    )).scalars().all()

    calendar = []
    for field in fields:
        bookings = (await db.execute(
            select(FieldBooking).where(
                FieldBooking.field_id == field.id,
                FieldBooking.start_time >= week_start,
                FieldBooking.start_time < week_end,
            ).order_by(FieldBooking.start_time)
        )).scalars().all()

        calendar.append({
            "field": FieldResponse.model_validate(field),
            "bookings": [FieldBookingResponse.model_validate(b) for b in bookings],
        })

    return calendar


# --- AI Field Optimization ---
@router.post("/api/organizations/{org_id}/fields/optimize")
async def optimize_field_allocation(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """AI optimizes field allocation for a given set of teams/needs."""
    fields = (await db.execute(
        select(Field).where(Field.org_id == org_id, Field.active == True)
    )).scalars().all()

    fields_info = [
        f"- {f.name}: {f.surface_type or 'unknown'} surface, {f.size or 'unknown'} size, lights={f.has_lights}, hours={f.permitted_hours}"
        for f in fields
    ]

    prompt = f"""You are a sports field allocation optimizer. Given these fields and team needs, suggest optimal assignments.

Fields:
{chr(10).join(fields_info)}

Team needs/constraints:
{request}

Respond with a JSON object: {{"assignments": [{{"team": "name", "field": "name", "day": "Monday", "time": "16:00-17:30", "reason": "..."}}], "notes": ["any warnings or suggestions"]}}"""

    try:
        response = await call_openai([{"role": "user", "content": prompt}], max_tokens=1500)
        import json
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass

    return {"assignments": [], "notes": ["AI optimization unavailable. Please assign fields manually."]}


# --- Weather Cancel ---
@router.post("/api/organizations/{org_id}/fields/weather-cancel")
async def weather_cancel(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """Cancel all outdoor bookings for a date."""
    cancel_date = request.get("date")
    if not cancel_date:
        raise HTTPException(400, "date is required")

    start_dt = datetime.fromisoformat(f"{cancel_date}T00:00:00")
    end_dt = datetime.fromisoformat(f"{cancel_date}T23:59:59")

    # Get outdoor fields
    outdoor_fields = (await db.execute(
        select(Field).where(
            Field.org_id == org_id,
            Field.active == True,
            Field.surface_type.in_(["grass", "turf"]),
        )
    )).scalars().all()
    field_ids = [f.id for f in outdoor_fields]

    if not field_ids:
        return {"cancelled": 0, "message": "No outdoor fields found"}

    bookings = (await db.execute(
        select(FieldBooking).where(
            FieldBooking.field_id.in_(field_ids),
            FieldBooking.status != "cancelled",
            FieldBooking.start_time >= start_dt,
            FieldBooking.start_time <= end_dt,
        )
    )).scalars().all()

    cancelled = 0
    for booking in bookings:
        booking.status = "cancelled"
        booking.notes = (booking.notes or "") + " [Weather cancellation]"
        cancelled += 1

    return {
        "cancelled": cancelled,
        "date": cancel_date,
        "fields_affected": [f.name for f in outdoor_fields],
    }
