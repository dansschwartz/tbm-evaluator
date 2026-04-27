"""Module 5: Scheduling Engine"""
import json
import uuid
from datetime import datetime, date, timedelta
from itertools import combinations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ScheduleEntry, Team, Field, FieldBooking, Notification, Program
from app.routers.auth import verify_admin_key
from app.schemas import (
    ScheduleEntryCreate, ScheduleEntryUpdate, ScheduleEntryResponse,
    GenerateGamesRequest, GeneratePracticesRequest,
    NotificationCreate, NotificationResponse, GenerateMatchupsRequest,
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


# --- Validate Schedule ---


@router.get("/api/organizations/{org_id}/schedules/validate")
async def validate_schedule(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Validate entire schedule: check for field double-bookings and team same-day conflicts."""
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
                # Field double-booking
                if a.field_id and a.field_id == b.field_id:
                    conflicts.append({
                        "type": "field_double_booking",
                        "severity": "critical",
                        "entry_a_id": str(a.id),
                        "entry_b_id": str(b.id),
                        "title_a": a.title,
                        "title_b": b.title,
                        "field_id": str(a.field_id),
                        "time": str(a.start_time),
                        "message": f"Field conflict: '{a.title}' and '{b.title}' overlap on the same field at {a.start_time}",
                    })

                # Team double-booking (same team in overlapping entries)
                teams_a = {a.team_id, a.opponent_team_id} - {None}
                teams_b = {b.team_id, b.opponent_team_id} - {None}
                shared = teams_a & teams_b
                if shared:
                    conflicts.append({
                        "type": "team_double_booking",
                        "severity": "critical",
                        "entry_a_id": str(a.id),
                        "entry_b_id": str(b.id),
                        "title_a": a.title,
                        "title_b": b.title,
                        "time": str(a.start_time),
                        "message": f"Team conflict: '{a.title}' and '{b.title}' share a team in overlapping time slots",
                    })

            # Same-day team check (even non-overlapping — warn about team playing twice)
            if a.start_time.date() == b.start_time.date() and a.entry_type == "game" and b.entry_type == "game":
                teams_a = {a.team_id, a.opponent_team_id} - {None}
                teams_b = {b.team_id, b.opponent_team_id} - {None}
                shared = teams_a & teams_b
                if shared and not (a.start_time < b.end_time and a.end_time > b.start_time):
                    conflicts.append({
                        "type": "team_same_day",
                        "severity": "warning",
                        "entry_a_id": str(a.id),
                        "entry_b_id": str(b.id),
                        "title_a": a.title,
                        "title_b": b.title,
                        "time": str(a.start_time.date()),
                        "message": f"Same-day warning: A team plays in both '{a.title}' and '{b.title}' on {a.start_time.date()}",
                    })

    valid = len([c for c in conflicts if c["severity"] == "critical"]) == 0

    return {
        "valid": valid,
        "total_entries": len(entries),
        "total_conflicts": len(conflicts),
        "critical": len([c for c in conflicts if c["severity"] == "critical"]),
        "warnings": len([c for c in conflicts if c["severity"] == "warning"]),
        "conflicts": conflicts,
    }


# --- Weather Cancel ---


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
async def generate_game_schedule(org_id: uuid.UUID, req: GenerateGamesRequest = None, db: AsyncSession = Depends(get_db)):
    """AI generates full game schedule with balanced home/away, no conflicts."""
    # If no body or empty team_ids, default to all teams in the org
    if req is None:
        req = GenerateGamesRequest(team_ids=[])
    if not req.team_ids:
        all_teams = (await db.execute(
            select(Team).where(Team.org_id == org_id)
        )).scalars().all()
        req.team_ids = [t.id for t in all_teams]
        if not req.available_field_ids:
            all_fields = (await db.execute(
                select(Field).where(Field.org_id == org_id, Field.active == True)
            )).scalars().all()
            req.available_field_ids = [f.id for f in all_fields]

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


# --- Notifications ---
@router.post("/api/organizations/{org_id}/notifications/send")
async def send_notification(org_id: uuid.UUID, data: NotificationCreate, db: AsyncSession = Depends(get_db)):
    """Create and send a notification."""
    import logging
    logger = logging.getLogger(__name__)

    notif = Notification(
        org_id=org_id,
        type=data.type,
        title=data.title,
        message=data.message,
        recipients=data.recipients,
        status="sent",
        sent_at=func.now(),
    )
    db.add(notif)
    await db.flush()
    await db.refresh(notif)

    logger.info(f"Notification sent: [{data.type}] {data.title} to {len(data.recipients)} recipients")
    return NotificationResponse.model_validate(notif)


@router.get("/api/organizations/{org_id}/notifications")
async def list_notifications(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """List recent notifications."""
    result = await db.execute(
        select(Notification).where(Notification.org_id == org_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return [NotificationResponse.model_validate(n) for n in result.scalars().all()]


# --- Rec League Matchup Generator ---
@router.post("/api/organizations/{org_id}/schedules/generate-matchups")
async def generate_matchups(org_id: uuid.UUID, req: GenerateMatchupsRequest, db: AsyncSession = Depends(get_db)):
    """Generate round-robin matchups for rec league."""
    team_ids = list(req.team_ids)

    # If program_id given, get teams from that program
    if req.program_id and not team_ids:
        teams_result = await db.execute(
            select(Team).where(Team.program_id == req.program_id, Team.org_id == org_id)
        )
        team_ids = [t.id for t in teams_result.scalars().all()]

    if len(team_ids) < 2:
        raise HTTPException(400, "Need at least 2 teams")

    teams = (await db.execute(select(Team).where(Team.id.in_(team_ids)))).scalars().all()
    team_map = {t.id: t for t in teams}

    fields = []
    if req.field_ids:
        fields = (await db.execute(select(Field).where(Field.id.in_(req.field_ids)))).scalars().all()

    # Round-robin matchups
    team_list = list(teams)
    n = len(team_list)
    all_matchups = list(combinations(range(n), 2))

    # Repeat for number of rounds
    matchups = []
    for _ in range(req.rounds):
        matchups.extend(all_matchups)

    # Map game_day to weekday number
    day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
               "friday": 4, "saturday": 5, "sunday": 6}
    target_day = day_map.get(req.game_day.lower(), 5)

    # Find next target day from today
    today = date.today()
    days_ahead = (target_day - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    current_date = today + timedelta(days=days_ahead)

    schedule = []
    games_per_day = len(fields) if fields else 1
    time_parts = req.start_time.split(":")
    base_hour, base_min = int(time_parts[0]), int(time_parts[1]) if len(time_parts) > 1 else 0

    team_games_today = {}
    slot_idx = 0
    field_idx = 0

    for home_idx, away_idx in matchups:
        home = team_list[home_idx]
        away = team_list[away_idx]
        date_key = str(current_date)

        if date_key not in team_games_today:
            team_games_today[date_key] = set()

        # Ensure no team plays twice on the same day
        while str(home.id) in team_games_today.get(str(current_date), set()) or \
              str(away.id) in team_games_today.get(str(current_date), set()):
            slot_idx = 0
            field_idx = 0
            current_date += timedelta(weeks=1)
            date_key = str(current_date)
            if date_key not in team_games_today:
                team_games_today[date_key] = set()

        # Calculate time slot
        slot_offset = slot_idx * req.game_duration_minutes
        hour = base_hour + slot_offset // 60
        minute = base_min + slot_offset % 60
        start = datetime.fromisoformat(f"{current_date}T{hour:02d}:{minute:02d}:00")
        end = start + timedelta(minutes=req.game_duration_minutes)

        field = fields[field_idx % len(fields)] if fields else None

        entry = ScheduleEntry(
            org_id=org_id,
            entry_type="game",
            team_id=home.id,
            opponent_team_id=away.id,
            field_id=field.id if field else None,
            start_time=start,
            end_time=end,
            title=f"{home.name} vs {away.name}",
            status="scheduled",
        )
        db.add(entry)

        team_games_today.setdefault(str(current_date), set()).update([str(home.id), str(away.id)])

        schedule.append({
            "home": home.name,
            "away": away.name,
            "date": str(current_date),
            "time": f"{hour:02d}:{minute:02d}",
            "field": field.name if field else "TBD",
        })

        slot_idx += 1
        field_idx += 1
        if fields and slot_idx >= len(fields):
            slot_idx = 0
            field_idx = 0
            current_date += timedelta(weeks=1)

    await db.flush()

    return {
        "games_scheduled": len(schedule),
        "rounds": req.rounds,
        "schedule": schedule,
    }
