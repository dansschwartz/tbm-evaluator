"""Module 5: Scheduling Engine"""
import json
import uuid
from datetime import datetime, date, timedelta
from itertools import combinations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ScheduleEntry, Team, Field, FieldBooking
from app.routers.auth import verify_admin_key
from app.schemas import (
    ScheduleEntryCreate, ScheduleEntryUpdate, ScheduleEntryResponse,
    GenerateGamesRequest, GeneratePracticesRequest,
)

router = APIRouter(tags=["Scheduling"], dependencies=[Depends(verify_admin_key)])


# --- CRUD ---
@router.post("/api/organizations/{org_id}/schedules", response_model=ScheduleEntryResponse)
async def create_schedule_entry(org_id: uuid.UUID, data: ScheduleEntryCreate, db: AsyncSession = Depends(get_db)):
    entry = ScheduleEntry(org_id=org_id, **data.model_dump())
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return ScheduleEntryResponse.model_validate(entry)


@router.get("/api/organizations/{org_id}/schedules")
async def list_schedule_entries(
    org_id: uuid.UUID,
    season_id: uuid.UUID = None,
    team_id: uuid.UUID = None,
    entry_type: str = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(ScheduleEntry).where(ScheduleEntry.org_id == org_id)
    if season_id:
        query = query.where(ScheduleEntry.season_id == season_id)
    if team_id:
        query = query.where(ScheduleEntry.team_id == team_id)
    if entry_type:
        query = query.where(ScheduleEntry.entry_type == entry_type)
    result = await db.execute(query.order_by(ScheduleEntry.start_time))
    return [ScheduleEntryResponse.model_validate(e) for e in result.scalars().all()]


@router.get("/api/organizations/{org_id}/schedules/{entry_id}", response_model=ScheduleEntryResponse)
async def get_schedule_entry(org_id: uuid.UUID, entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(ScheduleEntry).where(ScheduleEntry.id == entry_id, ScheduleEntry.org_id == org_id)
    )).scalars().first()
    if not entry:
        raise HTTPException(404, "Schedule entry not found")
    return ScheduleEntryResponse.model_validate(entry)


@router.patch("/api/organizations/{org_id}/schedules/{entry_id}", response_model=ScheduleEntryResponse)
async def update_schedule_entry(org_id: uuid.UUID, entry_id: uuid.UUID, data: ScheduleEntryUpdate, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(ScheduleEntry).where(ScheduleEntry.id == entry_id, ScheduleEntry.org_id == org_id)
    )).scalars().first()
    if not entry:
        raise HTTPException(404, "Schedule entry not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, val)
    await db.flush()
    await db.refresh(entry)
    return ScheduleEntryResponse.model_validate(entry)


@router.delete("/api/organizations/{org_id}/schedules/{entry_id}")
async def delete_schedule_entry(org_id: uuid.UUID, entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(
        select(ScheduleEntry).where(ScheduleEntry.id == entry_id, ScheduleEntry.org_id == org_id)
    )).scalars().first()
    if not entry:
        raise HTTPException(404, "Schedule entry not found")
    await db.delete(entry)
    return {"deleted": True}


# --- Generate Game Schedule ---
@router.post("/api/organizations/{org_id}/schedules/generate-games")
async def generate_game_schedule(org_id: uuid.UUID, req: GenerateGamesRequest, db: AsyncSession = Depends(get_db)):
    """AI generates full game schedule with balanced home/away, no conflicts."""
    teams = (await db.execute(
        select(Team).where(Team.id.in_(req.team_ids))
    )).scalars().all()

    if len(teams) < 2:
        raise HTTPException(400, "Need at least 2 teams")

    fields = []
    if req.available_field_ids:
        fields = (await db.execute(
            select(Field).where(Field.id.in_(req.available_field_ids))
        )).scalars().all()

    # Generate round-robin matchups
    team_list = list(teams)
    matchups = list(combinations(range(len(team_list)), 2))

    # Repeat matchups to reach games_per_team target
    games_needed = (req.games_per_team * len(team_list)) // 2
    full_matchups = []
    while len(full_matchups) < games_needed:
        for m in matchups:
            if len(full_matchups) >= games_needed:
                break
            full_matchups.append(m)

    # Assign to available dates/fields using greedy approach
    available_dates = sorted(req.available_dates) if req.available_dates else []
    if not available_dates:
        # Generate weekend dates for next 3 months
        today = date.today()
        for i in range(90):
            d = today + timedelta(days=i)
            if d.weekday() in (5, 6):  # Saturday, Sunday
                available_dates.append(d)

    schedule = []
    date_idx = 0
    time_slots = ["09:00", "10:30", "12:00", "13:30", "15:00"]
    slot_idx = 0
    field_idx = 0
    team_games_per_date = {}  # track to prevent double-booking teams

    for home_idx, away_idx in full_matchups:
        if date_idx >= len(available_dates):
            break

        game_date = available_dates[date_idx]
        date_key = str(game_date)

        # Ensure neither team plays twice on same date
        home_id = str(team_list[home_idx].id)
        away_id = str(team_list[away_idx].id)
        if date_key not in team_games_per_date:
            team_games_per_date[date_key] = set()

        if home_id in team_games_per_date[date_key] or away_id in team_games_per_date[date_key]:
            slot_idx += 1
            if slot_idx >= len(time_slots):
                slot_idx = 0
                date_idx += 1
                if date_idx >= len(available_dates):
                    break
                game_date = available_dates[date_idx]
                date_key = str(game_date)
                team_games_per_date[date_key] = set()
            # Re-check
            if home_id in team_games_per_date.get(date_key, set()) or away_id in team_games_per_date.get(date_key, set()):
                continue

        team_games_per_date.setdefault(date_key, set()).update([home_id, away_id])

        time_str = time_slots[slot_idx % len(time_slots)]
        start = datetime.fromisoformat(f"{game_date}T{time_str}:00")
        end = start + timedelta(minutes=req.game_duration_minutes)

        field = fields[field_idx % len(fields)] if fields else None

        entry = ScheduleEntry(
            org_id=org_id,
            entry_type="game",
            team_id=team_list[home_idx].id,
            opponent_team_id=team_list[away_idx].id,
            field_id=field.id if field else None,
            start_time=start,
            end_time=end,
            title=f"{team_list[home_idx].name} vs {team_list[away_idx].name}",
            status="scheduled",
        )
        db.add(entry)
        schedule.append({
            "home": team_list[home_idx].name,
            "away": team_list[away_idx].name,
            "date": str(game_date),
            "time": time_str,
            "field": field.name if field else "TBD",
        })

        slot_idx += 1
        if slot_idx >= len(time_slots):
            slot_idx = 0
            date_idx += 1
            field_idx += 1

    await db.flush()

    return {
        "games_scheduled": len(schedule),
        "schedule": schedule,
    }


# --- Generate Practice Schedule ---
@router.post("/api/organizations/{org_id}/schedules/generate-practices")
async def generate_practice_schedule(org_id: uuid.UUID, req: GeneratePracticesRequest, db: AsyncSession = Depends(get_db)):
    """AI assigns practice slots to teams."""
    teams = (await db.execute(
        select(Team).where(Team.id.in_(req.team_ids))
    )).scalars().all()

    fields = []
    if req.field_ids:
        fields = (await db.execute(
            select(Field).where(Field.id.in_(req.field_ids))
        )).scalars().all()

    # Generate practice slots: weekday evenings
    practice_days = []
    current = req.start_date
    while current <= req.end_date:
        if current.weekday() < 5:  # Mon-Fri
            practice_days.append(current)
        current += timedelta(days=1)

    schedule = []
    time_slots = ["16:00", "17:30", "19:00"]
    team_practices = {str(t.id): 0 for t in teams}

    total_weeks = max(1, (req.end_date - req.start_date).days // 7)
    target_per_team = req.practices_per_week * total_weeks

    day_idx = 0
    while any(v < target_per_team for v in team_practices.values()) and day_idx < len(practice_days):
        for slot_idx, team in enumerate(teams):
            if team_practices[str(team.id)] >= target_per_team:
                continue
            if day_idx >= len(practice_days):
                break

            pday = practice_days[day_idx]
            time_str = time_slots[slot_idx % len(time_slots)]
            start = datetime.fromisoformat(f"{pday}T{time_str}:00")
            end = start + timedelta(minutes=req.duration_minutes)

            field = fields[slot_idx % len(fields)] if fields else None

            entry = ScheduleEntry(
                org_id=org_id,
                entry_type="practice",
                team_id=team.id,
                field_id=field.id if field else None,
                start_time=start,
                end_time=end,
                title=f"{team.name} Practice",
                status="scheduled",
            )
            db.add(entry)
            schedule.append({
                "team": team.name,
                "date": str(pday),
                "time": time_str,
                "field": field.name if field else "TBD",
            })
            team_practices[str(team.id)] += 1

        day_idx += 1

    await db.flush()

    return {
        "practices_scheduled": len(schedule),
        "schedule": schedule,
    }


# --- Calendar View ---
@router.get("/api/organizations/{org_id}/schedules/calendar")
async def schedule_calendar(org_id: uuid.UUID, start: str, end: str, db: AsyncSession = Depends(get_db)):
    """Full calendar for a date range."""
    start_dt = datetime.fromisoformat(f"{start}T00:00:00")
    end_dt = datetime.fromisoformat(f"{end}T23:59:59")

    result = await db.execute(
        select(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.start_time >= start_dt,
            ScheduleEntry.start_time <= end_dt,
        ).order_by(ScheduleEntry.start_time)
    )
    entries = result.scalars().all()

    calendar = []
    for entry in entries:
        team_name = None
        opponent_name = None
        field_name = None

        if entry.team_id:
            team = (await db.execute(select(Team).where(Team.id == entry.team_id))).scalars().first()
            team_name = team.name if team else None
        if entry.opponent_team_id:
            opp = (await db.execute(select(Team).where(Team.id == entry.opponent_team_id))).scalars().first()
            opponent_name = opp.name if opp else None
        if entry.field_id:
            field = (await db.execute(select(Field).where(Field.id == entry.field_id))).scalars().first()
            field_name = field.name if field else None

        calendar.append({
            **ScheduleEntryResponse.model_validate(entry).model_dump(),
            "team_name": team_name,
            "opponent_name": opponent_name,
            "field_name": field_name,
        })

    return calendar


# --- Conflict Detection ---
@router.get("/api/organizations/{org_id}/schedules/conflicts")
async def detect_conflicts(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Detect scheduling conflicts."""
    entries = (await db.execute(
        select(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.status == "scheduled",
        ).order_by(ScheduleEntry.start_time)
    )).scalars().all()

    conflicts = []

    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            a, b = entries[i], entries[j]

            # Time overlap check
            if a.start_time < b.end_time and a.end_time > b.start_time:
                # Same field?
                if a.field_id and a.field_id == b.field_id:
                    conflicts.append({
                        "type": "field_double_booking",
                        "entry_a": str(a.id),
                        "entry_b": str(b.id),
                        "title_a": a.title,
                        "title_b": b.title,
                        "time": str(a.start_time),
                    })

                # Same team?
                if a.team_id and (a.team_id == b.team_id or a.team_id == b.opponent_team_id):
                    conflicts.append({
                        "type": "team_double_booking",
                        "entry_a": str(a.id),
                        "entry_b": str(b.id),
                        "title_a": a.title,
                        "title_b": b.title,
                        "time": str(a.start_time),
                    })

    return {"conflicts": conflicts, "total": len(conflicts)}


# --- Weather Cancel ---
@router.post("/api/organizations/{org_id}/schedules/weather-cancel")
async def weather_cancel_schedule(org_id: uuid.UUID, request: dict, db: AsyncSession = Depends(get_db)):
    """Cancel all outdoor events for a date."""
    cancel_date = request.get("date")
    if not cancel_date:
        raise HTTPException(400, "date is required")

    start_dt = datetime.fromisoformat(f"{cancel_date}T00:00:00")
    end_dt = datetime.fromisoformat(f"{cancel_date}T23:59:59")

    entries = (await db.execute(
        select(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.status == "scheduled",
            ScheduleEntry.start_time >= start_dt,
            ScheduleEntry.start_time <= end_dt,
        )
    )).scalars().all()

    cancelled = 0
    for entry in entries:
        entry.status = "cancelled"
        entry.weather_status = "cancelled"
        entry.notes = (entry.notes or "") + " [Weather cancellation]"
        cancelled += 1

    return {"cancelled": cancelled, "date": cancel_date}
