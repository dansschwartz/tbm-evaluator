"""Module 2: Field/Facility Management"""
import math
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, or_, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Field, FieldBooking, Team
from app.routers.auth import verify_admin_key
from app.schemas import (
    FieldBookingCreate, FieldBookingResponse, FieldBookingUpdate,
    FieldCreate, FieldResponse, FieldUpdate,
)
from app.services.ai import call_openai

router = APIRouter(tags=["Fields & Facilities"], dependencies=[Depends(verify_admin_key)])


# --- Haversine distance (km) ---
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Capitol building coords for ward detection
CAPITOL_LAT, CAPITOL_LNG = 38.8899, -77.0091


def detect_ward(lat: float, lng: float) -> str:
    if lat is None or lng is None:
        return "Unknown"
    if lat >= CAPITOL_LAT:
        return "NW" if lng <= CAPITOL_LNG else "NE"
    else:
        return "SW" if lng <= CAPITOL_LNG else "SE"


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


# ===================================================================
# SMART FIELD OPTIMIZER ENGINE
# ===================================================================

@router.post("/api/organizations/{org_id}/fields/optimize")
async def optimize_field_allocation(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """Algorithmic field optimizer with configurable weights."""
    optimize_for = request.get("optimize_for", "balanced")
    weights = request.get("weights", {"distance": 0.4, "field_quality": 0.3, "utilization": 0.3})
    constraints = request.get("constraints", {})
    team_ids = request.get("teams", None)

    # Normalize weights
    w_total = weights.get("distance", 0.4) + weights.get("field_quality", 0.3) + weights.get("utilization", 0.3)
    w_dist = weights.get("distance", 0.4) / w_total if w_total > 0 else 0.33
    w_qual = weights.get("field_quality", 0.3) / w_total if w_total > 0 else 0.33
    w_util = weights.get("utilization", 0.3) / w_total if w_total > 0 else 0.34

    # Shortcuts for optimize_for presets
    if optimize_for == "distance":
        w_dist, w_qual, w_util = 0.7, 0.15, 0.15
    elif optimize_for == "utilization":
        w_dist, w_qual, w_util = 0.15, 0.15, 0.7

    # Load fields
    fields = (await db.execute(
        select(Field).where(Field.org_id == org_id, Field.active == True)
    )).scalars().all()
    if not fields:
        return {"assignments": [], "ward_distribution": {}, "notes": ["No fields found"]}

    # Load teams
    team_query = select(Team).where(Team.org_id == org_id)
    if team_ids:
        team_query = team_query.where(Team.id.in_(team_ids))
    teams = (await db.execute(team_query)).scalars().all()
    if not teams:
        return {"assignments": [], "ward_distribution": {}, "notes": ["No teams found"]}

    # Compute field center (centroid of all fields with coords)
    fields_with_coords = [f for f in fields if f.latitude and f.longitude]
    if fields_with_coords:
        center_lat = sum(f.latitude for f in fields_with_coords) / len(fields_with_coords)
        center_lng = sum(f.longitude for f in fields_with_coords) / len(fields_with_coords)
    else:
        center_lat, center_lng = 38.9072, -77.0369  # DC center fallback

    # Count existing bookings per field for utilization scoring
    booking_counts = {}
    for field in fields:
        count = (await db.execute(
            select(sa_func.count()).select_from(FieldBooking).where(
                FieldBooking.field_id == field.id,
                FieldBooking.status != "cancelled",
            )
        )).scalar() or 0
        booking_counts[field.id] = count

    max_bookings = max(booking_counts.values()) if booking_counts else 1
    max_teams_per_field = constraints.get("max_teams_per_field", 3)
    require_lights_after = constraints.get("require_lights_after", "18:00")
    prefer_turf_in_rain = constraints.get("prefer_turf_in_rain", False)
    min_field_size_for_age = constraints.get("min_field_size_for_age", {})

    # Size ordering for comparison
    size_order = {"full": 4, "3_4": 3, "half": 2, "small": 1}

    # Track assignments per field
    assignments_per_field = {}

    # Greedy assignment: score each team-field pair
    assignments = []
    for team in teams:
        best_field = None
        best_score = -1
        best_reasons = []

        # Determine required min size from team name/age
        required_min_size = None
        for age_key, min_size in min_field_size_for_age.items():
            if age_key.lower() in (team.name or "").lower():
                required_min_size = min_size
                break

        # Check if team practices in the evening
        is_evening = False
        if team.practice_time:
            try:
                hour = int(team.practice_time.split(":")[0])
                require_hour = int(require_lights_after.split(":")[0])
                is_evening = hour >= require_hour
            except (ValueError, IndexError):
                pass

        for field in fields:
            reasons = []
            skip = False

            # Constraint: max teams per field
            if assignments_per_field.get(field.id, 0) >= max_teams_per_field:
                continue

            # Constraint: min field size for age group
            if required_min_size:
                field_size_val = size_order.get(field.size or "full", 4)
                req_size_val = size_order.get(required_min_size, 1)
                if field_size_val < req_size_val:
                    continue

            # Constraint: require lights for evening
            if is_evening and constraints.get("require_lights_after") and not field.has_lights:
                continue

            # Distance score (0-1, lower distance = higher score)
            if field.latitude and field.longitude:
                dist = haversine(center_lat, center_lng, field.latitude, field.longitude)
            else:
                dist = 10.0  # default penalty
            max_dist = 20.0
            dist_score = max(0, 1.0 - dist / max_dist)
            reasons.append(f"{dist:.1f}km from center")

            # Quality score (0-1)
            qual_score = 0.5
            if field.surface_type == "turf":
                qual_score += 0.3
                reasons.append("Turf surface")
            elif field.surface_type == "grass":
                qual_score += 0.1
            if field.has_lights:
                qual_score += 0.2
                if is_evening:
                    reasons.append("Lights available")
            if prefer_turf_in_rain and field.surface_type == "turf":
                qual_score += 0.1
                reasons.append("Rain-safe turf")
            qual_score = min(1.0, qual_score)

            # Utilization score (0-1, prefer underused)
            field_bookings = booking_counts.get(field.id, 0)
            util_score = 1.0 - (field_bookings / max_bookings) if max_bookings > 0 else 1.0
            if field_bookings == 0:
                reasons.append("Currently unused")
            elif field_bookings <= 2:
                reasons.append("Low utilization")

            # Combined score
            total_score = w_dist * dist_score + w_qual * qual_score + w_util * util_score

            if total_score > best_score:
                best_score = total_score
                best_field = field
                best_reasons = reasons
                best_dist = dist

        if best_field:
            assignments_per_field[best_field.id] = assignments_per_field.get(best_field.id, 0) + 1
            assignments.append({
                "team_id": str(team.id),
                "team_name": team.name,
                "assigned_field_id": str(best_field.id),
                "field_name": best_field.name,
                "surface": best_field.surface_type or "unknown",
                "score": round(best_score, 3),
                "distance_km": round(best_dist, 2) if best_field.latitude else None,
                "ward": detect_ward(best_field.latitude, best_field.longitude),
                "reasons": best_reasons,
            })

    # Ward distribution
    ward_counts = {}
    for a in assignments:
        w = a.get("ward", "Unknown")
        ward_counts[w] = ward_counts.get(w, 0) + 1

    return {
        "assignments": assignments,
        "ward_distribution": ward_counts,
        "total_teams": len(teams),
        "total_fields_used": len(assignments_per_field),
        "notes": [],
    }


# ===================================================================
# UTILIZATION DASHBOARD
# ===================================================================

@router.get("/api/organizations/{org_id}/fields/utilization")
async def field_utilization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Per-field utilization stats."""
    fields = (await db.execute(
        select(Field).where(Field.org_id == org_id, Field.active == True).order_by(Field.name)
    )).scalars().all()

    total_bookings = 0
    total_hours = 0.0
    field_stats = []

    for field in fields:
        bookings = (await db.execute(
            select(FieldBooking).where(
                FieldBooking.field_id == field.id,
                FieldBooking.status != "cancelled",
            )
        )).scalars().all()

        hours_used = sum(
            (b.end_time - b.start_time).total_seconds() / 3600.0
            for b in bookings
        )
        booking_count = len(bookings)
        total_bookings += booking_count
        total_hours += hours_used

        # Assume 60 available hours/week (Mon-Sat 8am-6pm ≈ 60h)
        available_hours = 60.0
        pct = round((hours_used / available_hours) * 100, 1) if available_hours > 0 else 0

        field_stats.append({
            "field_id": str(field.id),
            "field_name": field.name,
            "surface_type": field.surface_type,
            "total_bookings": booking_count,
            "hours_used": round(hours_used, 1),
            "available_hours": available_hours,
            "percent_utilized": pct,
            "status": "overutilized" if pct > 85 else ("underutilized" if pct < 40 else "normal"),
        })

    avg_util = round(sum(f["percent_utilized"] for f in field_stats) / len(field_stats), 1) if field_stats else 0

    return {
        "total_fields": len(fields),
        "total_bookings": total_bookings,
        "total_hours": round(total_hours, 1),
        "average_utilization": avg_util,
        "fields": field_stats,
    }


# ===================================================================
# WEATHER REASSIGNMENT
# ===================================================================

@router.post("/api/organizations/{org_id}/fields/weather-reassign")
async def weather_reassign(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """Suggest turf alternatives for affected grass fields on a given date."""
    target_date = request.get("date")
    affected_field_ids = request.get("affected_fields", [])
    reason = request.get("reason", "weather")

    if not target_date:
        raise HTTPException(400, "date is required")

    start_dt = datetime.fromisoformat(f"{target_date}T00:00:00")
    end_dt = datetime.fromisoformat(f"{target_date}T23:59:59")

    # If no specific fields given, default to all grass fields
    if affected_field_ids:
        affected_fields = (await db.execute(
            select(Field).where(Field.id.in_(affected_field_ids), Field.org_id == org_id)
        )).scalars().all()
    else:
        affected_fields = (await db.execute(
            select(Field).where(
                Field.org_id == org_id, Field.active == True,
                Field.surface_type == "grass",
            )
        )).scalars().all()

    # Get all turf fields as potential alternatives
    turf_fields = (await db.execute(
        select(Field).where(
            Field.org_id == org_id, Field.active == True,
            Field.surface_type == "turf",
        )
    )).scalars().all()

    reassignments = []

    for field in affected_fields:
        # Get bookings at this field on the target date
        bookings = (await db.execute(
            select(FieldBooking).where(
                FieldBooking.field_id == field.id,
                FieldBooking.status != "cancelled",
                FieldBooking.start_time >= start_dt,
                FieldBooking.start_time <= end_dt,
            )
        )).scalars().all()

        for booking in bookings:
            best_alt = None
            best_dist_change = float("inf")

            for turf in turf_fields:
                # Check if turf field is available at this time
                conflicts = (await db.execute(
                    select(FieldBooking).where(
                        FieldBooking.field_id == turf.id,
                        FieldBooking.status != "cancelled",
                        FieldBooking.start_time < booking.end_time,
                        FieldBooking.end_time > booking.start_time,
                    )
                )).scalars().first()
                if conflicts:
                    continue

                # Compute distance change
                if field.latitude and field.longitude and turf.latitude and turf.longitude:
                    dist = haversine(field.latitude, field.longitude, turf.latitude, turf.longitude)
                else:
                    dist = 5.0
                if dist < best_dist_change:
                    best_dist_change = dist
                    best_alt = turf

            reassignments.append({
                "booking_id": str(booking.id),
                "booking_title": booking.title or booking.event_type,
                "booking_time": booking.start_time.isoformat(),
                "original_field_id": str(field.id),
                "original_field_name": field.name,
                "suggested_field_id": str(best_alt.id) if best_alt else None,
                "suggested_field_name": best_alt.name if best_alt else "No alternative available",
                "distance_change_km": round(best_dist_change, 2) if best_alt else None,
                "reason": reason,
            })

    return {
        "date": target_date,
        "reason": reason,
        "total_affected": len(reassignments),
        "reassignments": reassignments,
    }


@router.post("/api/organizations/{org_id}/fields/weather-reassign/apply")
async def apply_weather_reassignments(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """Apply suggested weather reassignments — move bookings to new fields."""
    reassignments = request.get("reassignments", [])
    applied = 0

    for r in reassignments:
        booking_id = r.get("booking_id")
        new_field_id = r.get("suggested_field_id")
        if not booking_id or not new_field_id:
            continue

        booking = (await db.execute(
            select(FieldBooking).where(FieldBooking.id == booking_id)
        )).scalars().first()
        if not booking:
            continue

        booking.field_id = uuid.UUID(new_field_id)
        booking.notes = (booking.notes or "") + f" [Weather reassigned: {r.get('reason', 'weather')}]"
        applied += 1

    return {"applied": applied, "total_requested": len(reassignments)}


# --- Weather Cancel (legacy) ---
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
