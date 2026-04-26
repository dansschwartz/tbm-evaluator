import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import BookableSlot, Booking
from app.routers.auth import verify_admin_key

router = APIRouter(tags=["bookings"])


def _slot_dict(s):
    return {
        "id": str(s.id),
        "org_id": str(s.org_id),
        "title": s.title,
        "slot_type": s.slot_type,
        "capacity": s.capacity,
        "booked_count": s.booked_count,
        "available": (s.capacity or 0) - (s.booked_count or 0),
        "start_time": s.start_time.isoformat() if s.start_time else None,
        "end_time": s.end_time.isoformat() if s.end_time else None,
        "location": s.location,
        "price": s.price,
        "description": s.description,
        "coach_name": s.coach_name,
        "active": s.active,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _booking_dict(b):
    return {
        "id": str(b.id),
        "slot_id": str(b.slot_id),
        "player_id": str(b.player_id) if b.player_id else None,
        "parent_name": b.parent_name,
        "parent_email": b.parent_email,
        "status": b.status,
        "booked_at": b.booked_at.isoformat() if b.booked_at else None,
        "notes": b.notes,
    }


# ── Public endpoints (no auth) ──────────────────────────────────
@router.get("/api/organizations/{org_id}/bookings/available")
async def list_available_slots(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BookableSlot).where(
            BookableSlot.org_id == org_id,
            BookableSlot.active == True,
        ).order_by(BookableSlot.start_time.asc())
    )
    return [_slot_dict(s) for s in result.scalars().all()]


@router.post("/api/bookings")
async def book_slot(data: dict, db: AsyncSession = Depends(get_db)):
    slot_id = data.get("slot_id")
    if not slot_id:
        raise HTTPException(status_code=400, detail="slot_id required")

    slot = await db.get(BookableSlot, uuid.UUID(slot_id))
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if not slot.active:
        raise HTTPException(status_code=400, detail="Slot is not available")

    available = (slot.capacity or 0) - (slot.booked_count or 0)
    status = "confirmed" if available > 0 else "waitlisted"

    booking = Booking(
        id=uuid.uuid4(),
        slot_id=slot.id,
        player_id=uuid.UUID(data["player_id"]) if data.get("player_id") else None,
        parent_name=data.get("parent_name"),
        parent_email=data.get("parent_email"),
        status=status,
        notes=data.get("notes"),
    )
    db.add(booking)

    if status == "confirmed":
        slot.booked_count = (slot.booked_count or 0) + 1

    await db.flush()
    await db.refresh(booking)
    return _booking_dict(booking)


# ── Admin endpoints ──────────────────────────────────────────────
@router.get("/api/organizations/{org_id}/bookings", dependencies=[Depends(verify_admin_key)])
async def list_all_bookings(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Booking)
        .join(BookableSlot)
        .where(BookableSlot.org_id == org_id)
        .order_by(Booking.booked_at.desc())
    )
    return [_booking_dict(b) for b in result.scalars().all()]


@router.post("/api/organizations/{org_id}/bookings/slots", dependencies=[Depends(verify_admin_key)])
async def create_slot(org_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    from datetime import datetime
    slot = BookableSlot(
        id=uuid.uuid4(),
        org_id=org_id,
        title=data.get("title", "New Slot"),
        slot_type=data.get("slot_type", "camp"),
        capacity=data.get("capacity", 20),
        booked_count=0,
        start_time=datetime.fromisoformat(data["start_time"]) if data.get("start_time") else None,
        end_time=datetime.fromisoformat(data["end_time"]) if data.get("end_time") else None,
        location=data.get("location"),
        price=data.get("price"),
        description=data.get("description"),
        coach_name=data.get("coach_name"),
        active=data.get("active", True),
    )
    db.add(slot)
    await db.flush()
    await db.refresh(slot)
    return _slot_dict(slot)


@router.patch("/api/bookings/slots/{slot_id}", dependencies=[Depends(verify_admin_key)])
async def update_slot(slot_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    slot = await db.get(BookableSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    from datetime import datetime
    for key in ("title", "slot_type", "capacity", "location", "price", "description", "coach_name", "active"):
        if key in data:
            setattr(slot, key, data[key])
    if "start_time" in data and data["start_time"]:
        slot.start_time = datetime.fromisoformat(data["start_time"])
    if "end_time" in data and data["end_time"]:
        slot.end_time = datetime.fromisoformat(data["end_time"])
    await db.flush()
    await db.refresh(slot)
    return _slot_dict(slot)


@router.delete("/api/bookings/slots/{slot_id}", dependencies=[Depends(verify_admin_key)])
async def delete_slot(slot_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slot = await db.get(BookableSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    await db.delete(slot)
    return {"status": "deleted"}


@router.post("/api/bookings/{booking_id}/cancel", dependencies=[Depends(verify_admin_key)])
async def cancel_booking(booking_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == "confirmed":
        slot = await db.get(BookableSlot, booking.slot_id)
        if slot and slot.booked_count and slot.booked_count > 0:
            slot.booked_count -= 1

    booking.status = "cancelled"
    await db.flush()
    await db.refresh(booking)
    return _booking_dict(booking)
