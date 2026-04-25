"""Module 10: Operations Analytics Dashboard"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Player, Team, TeamRoster, Field, FieldBooking, Season, Program,
    ScheduleEntry, Evaluator, AttendanceRecord, Message, PlayerDocument,
)
from app.routers.auth import verify_admin_key

router = APIRouter(tags=["Operations Analytics"], dependencies=[Depends(verify_admin_key)])


@router.get("/api/organizations/{org_id}/dashboard")
async def master_dashboard(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Master operations dashboard."""
    now = datetime.utcnow()

    total_players = (await db.execute(
        select(func.count()).select_from(Player).where(Player.organization_id == org_id, Player.active == True)
    )).scalar() or 0

    total_teams = (await db.execute(
        select(func.count()).select_from(Team).where(Team.org_id == org_id)
    )).scalar() or 0

    total_fields = (await db.execute(
        select(func.count()).select_from(Field).where(Field.org_id == org_id, Field.active == True)
    )).scalar() or 0

    total_coaches = (await db.execute(
        select(func.count()).select_from(Evaluator).where(Evaluator.organization_id == org_id, Evaluator.active == True)
    )).scalar() or 0

    upcoming_events = (await db.execute(
        select(func.count()).select_from(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.status == "scheduled",
            ScheduleEntry.start_time >= now,
            ScheduleEntry.start_time <= now + timedelta(days=7),
        )
    )).scalar() or 0

    active_seasons = (await db.execute(
        select(func.count()).select_from(Season).where(Season.org_id == org_id, Season.status == "active")
    )).scalar() or 0

    messages_sent = (await db.execute(
        select(func.count()).select_from(Message).where(Message.org_id == org_id, Message.status == "sent")
    )).scalar() or 0

    # Recent activity
    recent_entries = (await db.execute(
        select(ScheduleEntry).where(
            ScheduleEntry.org_id == org_id,
            ScheduleEntry.start_time >= now,
        ).order_by(ScheduleEntry.start_time).limit(5)
    )).scalars().all()

    return {
        "total_players": total_players,
        "active_teams": total_teams,
        "total_fields": total_fields,
        "total_coaches": total_coaches,
        "upcoming_events_this_week": upcoming_events,
        "active_seasons": active_seasons,
        "messages_sent": messages_sent,
        "upcoming_events": [
            {"title": e.title, "type": e.entry_type, "start": str(e.start_time), "status": e.status}
            for e in recent_entries
        ],
    }


@router.get("/api/organizations/{org_id}/analytics/registration")
async def registration_analytics(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Registration trends by season/program."""
    seasons = (await db.execute(
        select(Season).where(Season.org_id == org_id).order_by(Season.start_date.desc().nullslast())
    )).scalars().all()

    data = []
    for season in seasons:
        programs = (await db.execute(
            select(Program).where(Program.season_id == season.id)
        )).scalars().all()

        season_players = 0
        program_data = []
        for prog in programs:
            team_ids = (await db.execute(
                select(Team.id).where(Team.program_id == prog.id)
            )).scalars().all()

            player_count = 0
            if team_ids:
                player_count = (await db.execute(
                    select(func.count()).select_from(TeamRoster).where(
                        TeamRoster.team_id.in_(team_ids),
                        TeamRoster.status == "active",
                    )
                )).scalar() or 0

            season_players += player_count
            program_data.append({
                "program": prog.name,
                "type": prog.program_type,
                "players": player_count,
                "max_capacity": (prog.max_players_per_team or 15) * (prog.max_teams or 1),
            })

        data.append({
            "season": season.name,
            "status": season.status,
            "total_players": season_players,
            "programs": program_data,
        })

    return data


@router.get("/api/organizations/{org_id}/analytics/retention")
async def retention_analytics(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Player retention — returning families vs new."""
    seasons = (await db.execute(
        select(Season).where(Season.org_id == org_id).order_by(Season.start_date.asc().nullslast())
    )).scalars().all()

    if len(seasons) < 2:
        return {"message": "Need at least 2 seasons for retention analysis", "seasons": []}

    retention_data = []
    prev_player_ids = set()

    for season in seasons:
        team_ids = (await db.execute(
            select(Team.id).where(Team.season_id == season.id)
        )).scalars().all()

        current_player_ids = set()
        if team_ids:
            roster_players = (await db.execute(
                select(TeamRoster.player_id).where(TeamRoster.team_id.in_(team_ids))
            )).scalars().all()
            current_player_ids = set(str(pid) for pid in roster_players)

        returning = current_player_ids & prev_player_ids if prev_player_ids else set()
        new = current_player_ids - prev_player_ids if prev_player_ids else current_player_ids

        retention_data.append({
            "season": season.name,
            "total_players": len(current_player_ids),
            "returning": len(returning),
            "new": len(new),
            "retention_rate": round(len(returning) / len(prev_player_ids) * 100, 1) if prev_player_ids else 0,
        })

        prev_player_ids = current_player_ids

    return retention_data


@router.get("/api/organizations/{org_id}/analytics/fields")
async def field_utilization(org_id: uuid.UUID, days: int = 30, db: AsyncSession = Depends(get_db)):
    """Field utilization rates."""
    now = datetime.utcnow()
    start = now - timedelta(days=days)

    fields = (await db.execute(
        select(Field).where(Field.org_id == org_id, Field.active == True)
    )).scalars().all()

    utilization = []
    for field in fields:
        bookings = (await db.execute(
            select(FieldBooking).where(
                FieldBooking.field_id == field.id,
                FieldBooking.status != "cancelled",
                FieldBooking.start_time >= start,
                FieldBooking.start_time <= now,
            )
        )).scalars().all()

        total_hours_booked = sum(
            (b.end_time - b.start_time).total_seconds() / 3600 for b in bookings
        )

        # Assume 6 usable hours per day
        total_available_hours = days * 6

        utilization.append({
            "field": field.name,
            "surface": field.surface_type,
            "bookings": len(bookings),
            "hours_booked": round(total_hours_booked, 1),
            "hours_available": total_available_hours,
            "utilization_pct": round(total_hours_booked / total_available_hours * 100, 1) if total_available_hours > 0 else 0,
        })

    utilization.sort(key=lambda x: x["utilization_pct"], reverse=True)
    return utilization


@router.get("/api/organizations/{org_id}/analytics/demographics")
async def demographics_analytics(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Player demographics — age, gender, etc."""
    players = (await db.execute(
        select(Player).where(Player.organization_id == org_id, Player.active == True)
    )).scalars().all()

    age_groups = {}
    positions = {}
    schools = {}

    for p in players:
        ag = p.age_group or "Unknown"
        age_groups[ag] = age_groups.get(ag, 0) + 1

        pos = p.position or "Unknown"
        positions[pos] = positions.get(pos, 0) + 1

        if p.school:
            schools[p.school] = schools.get(p.school, 0) + 1

    return {
        "total_players": len(players),
        "by_age_group": dict(sorted(age_groups.items())),
        "by_position": dict(sorted(positions.items(), key=lambda x: x[1], reverse=True)),
        "by_school": dict(sorted(schools.items(), key=lambda x: x[1], reverse=True)),
    }
