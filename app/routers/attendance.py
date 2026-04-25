"""Module 9: Attendance Tracking"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AttendanceRecord, ScheduleEntry, TeamRoster, Player, Team
from app.routers.auth import verify_admin_key
from app.schemas import AttendanceSubmit, AttendanceResponse

router = APIRouter(tags=["Attendance"], dependencies=[Depends(verify_admin_key)])


@router.post("/api/schedules/{entry_id}/attendance")
async def record_attendance(entry_id: uuid.UUID, data: AttendanceSubmit, db: AsyncSession = Depends(get_db)):
    """Record attendance for an event (batch)."""
    entry = (await db.execute(select(ScheduleEntry).where(ScheduleEntry.id == entry_id))).scalars().first()
    if not entry:
        raise HTTPException(404, "Schedule entry not found")

    created = 0
    updated = 0
    for record in data.records:
        player_id = uuid.UUID(record["player_id"]) if isinstance(record["player_id"], str) else record["player_id"]
        status = record.get("status", "present")

        existing = (await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.schedule_entry_id == entry_id,
                AttendanceRecord.player_id == player_id,
            )
        )).scalars().first()

        if existing:
            existing.status = status
            existing.notes = record.get("notes", existing.notes)
            existing.check_in_time = datetime.utcnow() if status in ("present", "late") else None
            updated += 1
        else:
            att = AttendanceRecord(
                org_id=entry.org_id,
                schedule_entry_id=entry_id,
                player_id=player_id,
                team_id=entry.team_id,
                status=status,
                check_in_time=datetime.utcnow() if status in ("present", "late") else None,
                recorded_by=record.get("recorded_by"),
                notes=record.get("notes"),
            )
            db.add(att)
            created += 1

    await db.flush()
    return {"created": created, "updated": updated}


@router.get("/api/schedules/{entry_id}/attendance")
async def get_attendance(entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get attendance for an event."""
    records = (await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.schedule_entry_id == entry_id)
    )).scalars().all()

    result = []
    for r in records:
        player = (await db.execute(select(Player).where(Player.id == r.player_id))).scalars().first()
        result.append({
            **AttendanceResponse.model_validate(r).model_dump(),
            "player_name": f"{player.first_name} {player.last_name}" if player else "Unknown",
        })
    return result


@router.get("/api/players/{player_id}/attendance-history")
async def player_attendance_history(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Player attendance history."""
    records = (await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.player_id == player_id)
        .order_by(AttendanceRecord.created_at.desc())
    )).scalars().all()

    total = len(records)
    present = sum(1 for r in records if r.status == "present")
    late = sum(1 for r in records if r.status == "late")
    absent = sum(1 for r in records if r.status == "absent")
    excused = sum(1 for r in records if r.status == "excused")

    return {
        "player_id": str(player_id),
        "total_events": total,
        "present": present,
        "late": late,
        "absent": absent,
        "excused": excused,
        "attendance_rate": round((present + late) / total * 100, 1) if total > 0 else 0,
        "records": [AttendanceResponse.model_validate(r).model_dump() for r in records[:50]],
    }


@router.get("/api/teams/{team_id}/attendance-stats")
async def team_attendance_stats(team_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Team attendance statistics."""
    records = (await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.team_id == team_id)
    )).scalars().all()

    # Group by player
    player_stats = {}
    for r in records:
        pid = str(r.player_id)
        if pid not in player_stats:
            player_stats[pid] = {"total": 0, "present": 0, "late": 0, "absent": 0, "excused": 0}
        player_stats[pid]["total"] += 1
        player_stats[pid][r.status] += 1

    # Enrich with player names
    result = []
    for pid, stats in player_stats.items():
        player = (await db.execute(select(Player).where(Player.id == uuid.UUID(pid)))).scalars().first()
        attended = stats["present"] + stats["late"]
        result.append({
            "player_id": pid,
            "player_name": f"{player.first_name} {player.last_name}" if player else "Unknown",
            "total_events": stats["total"],
            "attended": attended,
            "absent": stats["absent"],
            "excused": stats["excused"],
            "attendance_rate": round(attended / stats["total"] * 100, 1) if stats["total"] > 0 else 0,
        })

    result.sort(key=lambda x: x["attendance_rate"])

    total_events = len(set(r.schedule_entry_id for r in records))

    return {
        "team_id": str(team_id),
        "total_events_tracked": total_events,
        "players": result,
        "team_avg_attendance": round(
            sum(p["attendance_rate"] for p in result) / len(result), 1
        ) if result else 0,
    }


@router.get("/api/organizations/{org_id}/attendance/at-risk")
async def at_risk_players(org_id: uuid.UUID, threshold: float = 70.0, db: AsyncSession = Depends(get_db)):
    """Flag players with poor attendance."""
    records = (await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.org_id == org_id)
    )).scalars().all()

    player_stats = {}
    for r in records:
        pid = str(r.player_id)
        if pid not in player_stats:
            player_stats[pid] = {"total": 0, "attended": 0}
        player_stats[pid]["total"] += 1
        if r.status in ("present", "late"):
            player_stats[pid]["attended"] += 1

    at_risk = []
    for pid, stats in player_stats.items():
        if stats["total"] < 3:
            continue  # Need minimum events to flag
        rate = (stats["attended"] / stats["total"]) * 100
        if rate < threshold:
            player = (await db.execute(select(Player).where(Player.id == uuid.UUID(pid)))).scalars().first()
            at_risk.append({
                "player_id": pid,
                "player_name": f"{player.first_name} {player.last_name}" if player else "Unknown",
                "attendance_rate": round(rate, 1),
                "events_attended": stats["attended"],
                "total_events": stats["total"],
                "parent_email": player.parent_email if player else None,
            })

    at_risk.sort(key=lambda x: x["attendance_rate"])
    return {"threshold": threshold, "at_risk_players": at_risk, "total": len(at_risk)}
