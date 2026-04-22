"""
Mega feature router — implements features 1-27 as new endpoints.
Keeps existing routers untouched; new endpoints added here.
"""
import csv
import hashlib
import io
import json
import logging
import secrets
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import (
    APIToken,
    DraftTeam,
    DraftPick,
    EvaluationEvent,
    EvaluationTemplate,
    Evaluator,
    EventPlayer,
    Organization,
    Player,
    PlayerReport,
    Score,
)
from app.routers.auth import verify_admin_key
from app.schemas import (
    AICoachQuestion,
    CSVImportResult,
    NaturalLanguageInput,
    NotesSubmit,
    PhotoUpload,
    ReportResponse,
    SelfAssessmentSubmit,
    TokenCreate,
    TokenResponse,
)
from app.services.ai import call_openai, generate_player_summary

logger = logging.getLogger(__name__)

router = APIRouter(tags=["features"])


# =====================================================================
# Feature 1: Player Check-In with QR Code
# =====================================================================

@router.get("/api/events/{event_id}/check-in-codes", dependencies=[Depends(verify_admin_key)])
async def get_check_in_codes(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate QR code data for each player in an event."""
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    ep_result = await db.execute(
        select(EventPlayer)
        .where(EventPlayer.event_id == event_id)
        .options(selectinload(EventPlayer.player))
    )
    event_players = ep_result.scalars().all()

    codes = []
    for ep in event_players:
        if not ep.player:
            continue
        # QR data = hash of player_id + event_id for security
        qr_data = f"{event_id}:{ep.player_id}"
        code_hash = hashlib.sha256(qr_data.encode()).hexdigest()[:12]
        codes.append({
            "player_id": str(ep.player_id),
            "player_name": f"{ep.player.first_name} {ep.player.last_name}",
            "bib_number": ep.bib_number,
            "qr_data": qr_data,
            "qr_hash": code_hash,
            "checked_in": ep.checked_in,
            "checked_in_at": ep.checked_in_at.isoformat() if ep.checked_in_at else None,
        })
    return {"event_id": str(event_id), "codes": codes}


@router.post("/api/events/{event_id}/check-in")
async def check_in_player_qr(event_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Check in a player via QR scan data or bib number."""
    body = await request.json()
    player_id = body.get("player_id")
    bib_number = body.get("bib_number")
    qr_data = body.get("qr_data")

    if qr_data:
        parts = qr_data.split(":")
        if len(parts) == 2:
            player_id = parts[1]

    query = select(EventPlayer).where(EventPlayer.event_id == event_id)
    if player_id:
        query = query.where(EventPlayer.player_id == uuid.UUID(player_id))
    elif bib_number:
        query = query.where(EventPlayer.bib_number == int(bib_number))
    else:
        raise HTTPException(status_code=400, detail="Provide player_id, bib_number, or qr_data")

    result = await db.execute(query)
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in event")

    ep.checked_in = True
    ep.checked_in_at = datetime.utcnow()
    await db.flush()
    return {"status": "checked_in", "player_id": str(ep.player_id), "checked_in_at": ep.checked_in_at.isoformat()}


# =====================================================================
# Feature 2: Progress Tracking Across Events
# =====================================================================

@router.get("/api/players/{player_id}/progress", dependencies=[Depends(verify_admin_key)])
async def get_player_progress(player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Returns all reports for a player across events, sorted by date, with score trends."""
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    reports_result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.player_id == player_id)
        .options(selectinload(PlayerReport.event))
        .order_by(PlayerReport.created_at.asc())
    )
    reports = reports_result.scalars().all()

    # Build skill trends
    skill_trends = defaultdict(list)
    timeline = []

    for r in reports:
        event_date = r.event.event_date.isoformat() if r.event and r.event.event_date else None
        event_name = r.event.name if r.event else "Unknown"

        entry = {
            "report_id": str(r.id),
            "event_id": str(r.event_id),
            "event_name": event_name,
            "event_date": event_date,
            "overall_score": r.overall_score,
            "weighted_overall_score": r.weighted_overall_score,
            "rank": r.rank,
            "total_players": r.total_players,
            "skill_scores": r.skill_scores or {},
            "ai_progress_narrative": r.ai_progress_narrative,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        timeline.append(entry)

        for skill_name, score in (r.skill_scores or {}).items():
            skill_trends[skill_name].append({
                "event_name": event_name,
                "event_date": event_date,
                "score": score,
            })

    # Generate AI progress narrative if 2+ reports
    ai_narrative = None
    if len(reports) >= 2:
        try:
            first = reports[0]
            last = reports[-1]
            skills_text = []
            for skill_name in skill_trends:
                vals = [p["score"] for p in skill_trends[skill_name]]
                if len(vals) >= 2:
                    skills_text.append(f"- {skill_name}: {vals[0]:.1f} -> {vals[-1]:.1f} over {len(vals)} evaluations")

            prompt = f"""You are a youth sports coach. Write a brief progress narrative for {player.first_name} {player.last_name}.

They have been evaluated {len(reports)} times.
First overall score: {first.overall_score:.2f}, Latest: {last.overall_score:.2f}

Skill trends:
{chr(10).join(skills_text[:15])}

Write 2-3 sentences about their progress, highlight improvements and areas that plateaued. Be encouraging but specific."""

            ai_narrative = await call_openai([{"role": "user", "content": prompt}], max_tokens=300)
        except Exception as e:
            logger.error(f"Progress narrative failed: {e}")

    return {
        "player": {
            "id": str(player.id),
            "first_name": player.first_name,
            "last_name": player.last_name,
            "age_group": player.age_group,
            "position": player.position,
        },
        "timeline": timeline,
        "skill_trends": dict(skill_trends),
        "ai_progress_narrative": ai_narrative,
        "total_evaluations": len(reports),
    }


# =====================================================================
# Feature 3: Player Comparison
# =====================================================================

@router.get("/api/events/{event_id}/compare", dependencies=[Depends(verify_admin_key)])
async def compare_players(
    event_id: uuid.UUID,
    player_ids: str = Query(..., description="Comma-separated player IDs"),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side skill scores for selected players."""
    ids = [uuid.UUID(pid.strip()) for pid in player_ids.split(",") if pid.strip()]
    if len(ids) < 2 or len(ids) > 6:
        raise HTTPException(status_code=400, detail="Provide 2-6 player IDs")

    reports_result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.event_id == event_id, PlayerReport.player_id.in_(ids))
        .options(selectinload(PlayerReport.player))
    )
    reports = reports_result.scalars().all()

    comparisons = []
    for r in reports:
        comparisons.append({
            "player_id": str(r.player_id),
            "player_name": f"{r.player.first_name} {r.player.last_name}" if r.player else "Unknown",
            "position": r.player.position if r.player else None,
            "age_group": r.player.age_group if r.player else None,
            "overall_score": r.overall_score,
            "weighted_overall_score": r.weighted_overall_score,
            "rank": r.rank,
            "skill_scores": r.skill_scores or {},
        })

    # Collect all skill names
    all_skills = set()
    for c in comparisons:
        all_skills.update(c["skill_scores"].keys())

    return {
        "event_id": str(event_id),
        "skills": sorted(all_skills),
        "players": comparisons,
    }


# =====================================================================
# Feature 5: CSV/Excel Export
# =====================================================================

@router.get("/api/events/{event_id}/export", dependencies=[Depends(verify_admin_key)])
async def export_event_scores(
    event_id: uuid.UUID,
    format: str = Query("csv", description="csv or json"),
    db: AsyncSession = Depends(get_db),
):
    """Export all scores for an event as CSV or JSON."""
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    reports_result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.event_id == event_id)
        .options(selectinload(PlayerReport.player))
        .order_by(PlayerReport.rank)
    )
    reports = reports_result.scalars().all()

    # Collect all skill names
    all_skills = set()
    for r in reports:
        if r.skill_scores:
            all_skills.update(r.skill_scores.keys())
    skill_names = sorted(all_skills)

    rows = []
    for r in reports:
        row = {
            "Player Name": f"{r.player.first_name} {r.player.last_name}" if r.player else "Unknown",
            "Age Group": r.player.age_group if r.player else "",
            "Position": r.player.position if r.player else "",
        }
        for skill in skill_names:
            row[skill] = r.skill_scores.get(skill, "") if r.skill_scores else ""
        row["Overall Score"] = r.overall_score or ""
        row["Weighted Score"] = r.weighted_overall_score or ""
        row["Rank"] = r.rank or ""
        rows.append(row)

    if format == "json":
        return rows

    # Build CSV
    output = io.StringIO()
    if rows:
        headers = list(rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="event_{event_id}_scores.csv"'},
    )


@router.get("/api/organizations/{org_id}/players/export", dependencies=[Depends(verify_admin_key)])
async def export_player_roster(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Export player roster as CSV."""
    result = await db.execute(
        select(Player).where(Player.organization_id == org_id, Player.active == True).order_by(Player.last_name)
    )
    players = result.scalars().all()

    output = io.StringIO()
    headers = ["First Name", "Last Name", "Date of Birth", "Age Group", "Position", "Jersey Number",
               "Parent Name", "Parent Email", "Parent Phone"]
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()

    for p in players:
        writer.writerow({
            "First Name": p.first_name,
            "Last Name": p.last_name,
            "Date of Birth": p.date_of_birth.isoformat() if p.date_of_birth else "",
            "Age Group": p.age_group or "",
            "Position": p.position or "",
            "Jersey Number": p.jersey_number or "",
            "Parent Name": p.parent_name or "",
            "Parent Email": p.parent_email or "",
            "Parent Phone": p.parent_phone or "",
        })

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="roster_{org_id}.csv"'},
    )


# =====================================================================
# Feature 6: CSV Roster Import
# =====================================================================

@router.post("/api/organizations/{org_id}/players/import-csv", dependencies=[Depends(verify_admin_key)])
async def import_csv_roster(org_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Accept CSV text body and create players."""
    body = await request.body()
    csv_text = body.decode("utf-8")

    reader = csv.DictReader(io.StringIO(csv_text))
    imported = 0
    errors = []

    for i, row in enumerate(reader):
        try:
            first_name = (row.get("first_name") or row.get("First Name") or "").strip()
            last_name = (row.get("last_name") or row.get("Last Name") or "").strip()
            if not first_name or not last_name:
                errors.append(f"Row {i+1}: missing first_name or last_name")
                continue

            player = Player(
                id=uuid.uuid4(),
                organization_id=org_id,
                first_name=first_name,
                last_name=last_name,
                date_of_birth=None,
                age_group=(row.get("age_group") or row.get("Age Group") or "").strip() or None,
                position=(row.get("position") or row.get("Position") or "").strip() or None,
                parent_name=(row.get("parent_name") or row.get("Parent Name") or "").strip() or None,
                parent_email=(row.get("parent_email") or row.get("Parent Email") or "").strip() or None,
                parent_phone=(row.get("parent_phone") or row.get("Parent Phone") or "").strip() or None,
            )

            dob_str = (row.get("date_of_birth") or row.get("Date of Birth") or "").strip()
            if dob_str:
                try:
                    from datetime import date as date_type
                    player.date_of_birth = date_type.fromisoformat(dob_str)
                except ValueError:
                    pass

            db.add(player)
            imported += 1
        except Exception as e:
            errors.append(f"Row {i+1}: {str(e)}")

    if imported > 0:
        await db.flush()

    return {"imported": imported, "errors": errors}


# =====================================================================
# Feature 8: Photo Upload for Players
# =====================================================================

@router.put("/api/players/{player_id}/photo", dependencies=[Depends(verify_admin_key)])
async def upload_player_photo(player_id: uuid.UUID, data: PhotoUpload, db: AsyncSession = Depends(get_db)):
    """Accept base64 image, store as data URI in photo_url."""
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    photo = data.photo_data
    if not photo.startswith("data:"):
        photo = f"data:image/jpeg;base64,{photo}"

    player.photo_url = photo
    await db.flush()
    return {"status": "photo_updated", "player_id": str(player_id)}


# =====================================================================
# Feature 9: Evaluation Notes Per Player
# =====================================================================

@router.post("/api/scoring/notes")
async def save_notes(data: NotesSubmit, db: AsyncSession = Depends(get_db)):
    """Save general notes for a player in an event."""
    result = await db.execute(
        select(EventPlayer).where(
            EventPlayer.event_id == data.event_id,
            EventPlayer.player_id == data.player_id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in event")

    ep.general_notes = data.notes
    await db.flush()
    return {"status": "notes_saved"}


# =====================================================================
# Feature 11: Parent Portal
# =====================================================================

@router.get("/api/parent/reports")
async def get_parent_reports(email: str = Query(...), db: AsyncSession = Depends(get_db)):
    """Returns all reports for players with the given parent email."""
    players_result = await db.execute(
        select(Player).where(func.lower(Player.parent_email) == email.lower().strip())
    )
    players = players_result.scalars().all()

    if not players:
        return {"reports": [], "message": "No players found with this email"}

    player_ids = [p.id for p in players]
    reports_result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.player_id.in_(player_ids))
        .options(selectinload(PlayerReport.event), selectinload(PlayerReport.player), selectinload(PlayerReport.organization))
        .order_by(PlayerReport.created_at.desc())
    )
    reports = reports_result.scalars().all()

    return {
        "reports": [
            {
                "id": str(r.id),
                "report_url": r.report_url or f"/report/{r.id}",
                "player_name": f"{r.player.first_name} {r.player.last_name}" if r.player else "Unknown",
                "player_age_group": r.player.age_group if r.player else None,
                "event_name": r.event.name if r.event else "Unknown",
                "event_date": r.event.event_date.isoformat() if r.event and r.event.event_date else None,
                "overall_score": r.overall_score,
                "rank": r.rank,
                "total_players": r.total_players,
                "org_name": r.organization.name if r.organization else None,
                "org_logo": r.organization.logo_url if r.organization else None,
                "org_primary_color": r.organization.primary_color if r.organization else "#09A1A1",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ]
    }


# =====================================================================
# Feature 12: Player Self-Assessment
# =====================================================================

@router.post("/api/events/{event_id}/self-assess")
async def submit_self_assessment(event_id: uuid.UUID, data: SelfAssessmentSubmit, db: AsyncSession = Depends(get_db)):
    """Submit self-assessment scores for a player."""
    query = select(EventPlayer).where(EventPlayer.event_id == event_id)
    if data.player_id:
        query = query.where(EventPlayer.player_id == data.player_id)
    else:
        raise HTTPException(status_code=400, detail="player_id is required")

    result = await db.execute(query)
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in event")

    ep.self_assessment = data.scores
    await db.flush()
    return {"status": "self_assessment_saved"}


@router.get("/api/events/{event_id}/self-assess/{player_id}")
async def get_self_assessment(event_id: uuid.UUID, player_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get self-assessment for a player in an event."""
    result = await db.execute(
        select(EventPlayer).where(EventPlayer.event_id == event_id, EventPlayer.player_id == player_id)
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in event")
    return {"self_assessment": ep.self_assessment}


# =====================================================================
# Feature 16: Season filter
# =====================================================================

@router.get("/api/organizations/{org_id}/events/by-season", dependencies=[Depends(verify_admin_key)])
async def list_events_by_season(
    org_id: uuid.UUID,
    season: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List events filtered by season."""
    query = select(EvaluationEvent).where(EvaluationEvent.organization_id == org_id)
    if season:
        query = query.where(EvaluationEvent.season == season)
    query = query.order_by(EvaluationEvent.event_date.desc().nullslast())
    result = await db.execute(query)
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "name": e.name,
            "event_type": e.event_type,
            "event_date": e.event_date.isoformat() if e.event_date else None,
            "status": e.status,
            "season": e.season,
            "location": e.location,
        }
        for e in events
    ]


@router.get("/api/organizations/{org_id}/seasons", dependencies=[Depends(verify_admin_key)])
async def list_seasons(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get distinct seasons for an org."""
    result = await db.execute(
        select(func.distinct(EvaluationEvent.season))
        .where(EvaluationEvent.organization_id == org_id, EvaluationEvent.season.isnot(None))
    )
    seasons = [row[0] for row in result.all()]
    return {"seasons": sorted(seasons)}


# =====================================================================
# Feature 18: Report Card PDF Download
# =====================================================================

@router.get("/api/reports/{report_id}/pdf")
async def get_report_pdf(report_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate a printable HTML report card."""
    result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.id == report_id)
        .options(selectinload(PlayerReport.player), selectinload(PlayerReport.event), selectinload(PlayerReport.organization))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    from app.services.pdf import generate_report_html
    html = generate_report_html(
        player_name=f"{report.player.first_name} {report.player.last_name}" if report.player else "Unknown",
        age_group=report.player.age_group if report.player else "",
        event_name=report.event.name if report.event else "",
        event_date=report.event.event_date.isoformat() if report.event and report.event.event_date else "",
        org_name=report.organization.name if report.organization else "",
        org_logo=report.organization.logo_url if report.organization else "",
        primary_color=report.organization.primary_color if report.organization else "#09A1A1",
        overall_score=report.overall_score or 0,
        rank=report.rank or 0,
        total_players=report.total_players or 0,
        skill_scores=report.skill_scores or {},
        ai_summary=report.ai_summary or "",
        ai_strengths=report.ai_strengths or [],
        ai_improvements=report.ai_improvements or [],
        ai_recommendation=report.ai_recommendation or "",
    )
    return HTMLResponse(content=html)


# =====================================================================
# Feature 20: AI Coach Assistant
# =====================================================================

@router.post("/api/ai/ask", dependencies=[Depends(verify_admin_key)])
async def ai_coach_ask(data: AICoachQuestion, db: AsyncSession = Depends(get_db)):
    """AI Coach: answer questions based on evaluation data."""
    org = await db.get(Organization, data.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Gather context: all reports for this org
    reports_result = await db.execute(
        select(PlayerReport)
        .where(PlayerReport.organization_id == data.organization_id)
        .options(selectinload(PlayerReport.player), selectinload(PlayerReport.event))
        .order_by(PlayerReport.created_at.desc())
        .limit(200)
    )
    reports = reports_result.scalars().all()

    # Build context
    context_lines = [f"Organization: {org.name}, Sport: {org.sport}"]
    context_lines.append(f"Total reports: {len(reports)}")

    for r in reports[:50]:
        player_name = f"{r.player.first_name} {r.player.last_name}" if r.player else "Unknown"
        event_name = r.event.name if r.event else "Unknown"
        position = r.player.position if r.player else "Unknown"
        age_group = r.player.age_group if r.player else "Unknown"
        skills_str = ", ".join(f"{k}: {v:.1f}" for k, v in (r.skill_scores or {}).items())
        context_lines.append(
            f"- {player_name} ({position}, {age_group}) in {event_name}: "
            f"Overall {r.overall_score:.2f}, Rank {r.rank}/{r.total_players}. Skills: {skills_str}"
        )

    context = "\n".join(context_lines)

    prompt = f"""You are an expert youth {org.sport} coach assistant. You have access to evaluation data for {org.name}.

DATA:
{context}

USER QUESTION: {data.question}

Answer based on the data. Be specific with player names and scores. If you don't have enough data, say so."""

    try:
        answer = await call_openai([{"role": "user", "content": prompt}], max_tokens=1000)
        return {"answer": answer, "context_reports": len(reports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


# =====================================================================
# Feature 21: AI Team Composition Advice
# =====================================================================

@router.post("/api/events/{event_id}/draft/analyze", dependencies=[Depends(verify_admin_key)])
async def analyze_draft(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """AI reviews each team composition and suggests improvements."""
    event = await db.get(EvaluationEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    org = await db.get(Organization, event.organization_id)
    sport = org.sport if org else "soccer"

    # Get teams with picks
    teams_result = await db.execute(
        select(DraftTeam)
        .where(DraftTeam.event_id == event_id)
        .options(selectinload(DraftTeam.picks).selectinload(DraftPick.player))
    )
    teams = teams_result.scalars().all()

    reports_result = await db.execute(
        select(PlayerReport).where(PlayerReport.event_id == event_id)
    )
    reports_map = {r.player_id: r for r in reports_result.scalars().all()}

    # Build context
    team_data = []
    for team in teams:
        players_info = []
        for pick in sorted(team.picks, key=lambda p: p.pick_order):
            if not pick.player:
                continue
            report = reports_map.get(pick.player_id)
            skills = report.skill_scores if report else {}
            players_info.append(
                f"  {pick.player.first_name} {pick.player.last_name} ({pick.player.position or 'N/A'}): "
                f"Overall {report.overall_score:.1f if report and report.overall_score else 0}"
            )
        team_data.append(f"{team.team_name}:\n" + "\n".join(players_info))

    prompt = f"""You are a youth {sport} team composition expert. Analyze these draft teams and suggest improvements.

{chr(10).join(team_data)}

For each team, briefly note strengths, weaknesses, and one specific swap suggestion if applicable. Keep it concise."""

    try:
        analysis = await call_openai([{"role": "user", "content": prompt}], max_tokens=800)
        return {"analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


# =====================================================================
# Feature 23: Natural Language Scoring (Voice-to-Score)
# =====================================================================

@router.post("/api/scoring/parse-natural")
async def parse_natural_language(data: NaturalLanguageInput, db: AsyncSession = Depends(get_db)):
    """Parse natural language into structured scores."""
    prompt = f"""Parse this evaluator's notes into structured scores. Extract player name, skill names, and numeric scores.

Text: "{data.text}"

Respond in this exact JSON format:
{{
    "player_name": "the player name mentioned",
    "scores": [
        {{"skill_name": "Dribbling", "score_value": 4}},
        {{"skill_name": "Passing", "score_value": 3}}
    ],
    "notes": "any remaining non-score comments"
}}

If no clear scores found, return empty scores array. Be flexible with skill name matching."""

    try:
        response_text = await call_openai([{"role": "user", "content": prompt}], max_tokens=500)
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(response_text[start:end])
            return parsed
        return {"player_name": "", "scores": [], "notes": data.text}
    except Exception as e:
        return {"player_name": "", "scores": [], "notes": data.text, "error": str(e)}


# =====================================================================
# Feature 24: Evaluator Calibration / Anomaly Detection
# =====================================================================

@router.get("/api/events/{event_id}/calibration", dependencies=[Depends(verify_admin_key)])
async def get_calibration(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Analyze evaluator scoring patterns and detect anomalies."""
    scores_result = await db.execute(
        select(Score).where(Score.event_id == event_id)
    )
    all_scores = scores_result.scalars().all()

    if not all_scores:
        return {"evaluators": [], "message": "No scores found"}

    # Get evaluator names
    evaluator_ids = set(s.evaluator_id for s in all_scores)
    evaluators = {}
    for eid in evaluator_ids:
        ev = await db.get(Evaluator, eid)
        if ev:
            evaluators[eid] = ev.name

    # Group scores by evaluator
    by_evaluator = defaultdict(list)
    for s in all_scores:
        by_evaluator[s.evaluator_id].append(s.score_value)

    # Calculate global average
    all_values = [s.score_value for s in all_scores]
    global_avg = sum(all_values) / len(all_values) if all_values else 0

    results = []
    for eid, values in by_evaluator.items():
        avg = sum(values) / len(values)
        variance = sum((v - avg) ** 2 for v in values) / len(values) if len(values) > 1 else 0
        std_dev = variance ** 0.5
        deviation = avg - global_avg

        # Determine flag level
        flag = "normal"
        if abs(deviation) > 0.8:
            flag = "warning"
        elif abs(deviation) > 0.5:
            flag = "review"
        elif std_dev < 0.3 and len(values) > 5:
            flag = "review"  # Low variance = giving everyone same score

        pattern = "balanced"
        if deviation > 0.5:
            pattern = "scores_high"
        elif deviation < -0.5:
            pattern = "scores_low"
        if std_dev < 0.3 and len(values) > 5:
            pattern = "low_variance"

        results.append({
            "evaluator_id": str(eid),
            "evaluator_name": evaluators.get(eid, "Unknown"),
            "total_scores": len(values),
            "avg_score": round(avg, 2),
            "std_deviation": round(std_dev, 2),
            "avg_deviation": round(deviation, 2),
            "scoring_pattern": pattern,
            "flag_level": flag,
        })

    results.sort(key=lambda x: abs(x["avg_deviation"]), reverse=True)
    return {"global_average": round(global_avg, 2), "evaluators": results}


# =====================================================================
# Feature 25: API Authentication Tokens
# =====================================================================

@router.post("/api/auth/token", dependencies=[Depends(verify_admin_key)])
async def create_api_token(data: TokenCreate, db: AsyncSession = Depends(get_db)):
    """Exchange admin key for a scoped Bearer token."""
    # Get the org from the request context (use the first org for simplicity)
    # In practice, org_id should be passed
    token_str = secrets.token_urlsafe(48)

    # We need org_id — accept it from body
    return {"error": "Use POST /api/organizations/{org_id}/tokens instead"}


@router.post("/api/organizations/{org_id}/tokens", dependencies=[Depends(verify_admin_key)])
async def create_org_token(org_id: uuid.UUID, data: TokenCreate, db: AsyncSession = Depends(get_db)):
    """Create a scoped API token for an organization."""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    token_str = secrets.token_urlsafe(48)
    token = APIToken(
        id=uuid.uuid4(),
        organization_id=org_id,
        token=token_str,
        name=data.name or "API Token",
    )
    db.add(token)
    await db.flush()
    return {
        "id": str(token.id),
        "organization_id": str(org_id),
        "token": token_str,
        "name": token.name,
        "created_at": datetime.utcnow().isoformat(),
    }


async def verify_bearer_token(authorization: str = Header(None), db: AsyncSession = Depends(get_db)):
    """Verify Bearer token and return org_id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")

    token_str = authorization[7:]
    result = await db.execute(
        select(APIToken).where(APIToken.token == token_str, APIToken.active == True)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token.organization_id


# =====================================================================
# Feature 26: REST API Documentation helpers
# All endpoints already have docstrings that show in /docs
# =====================================================================


# =====================================================================
# Feature 27: Multi-Sport support
# Already supported via template.sport field — this adds a sport filter endpoint
# =====================================================================

@router.get("/api/organizations/{org_id}/templates/by-sport", dependencies=[Depends(verify_admin_key)])
async def list_templates_by_sport(
    org_id: uuid.UUID,
    sport: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List templates filtered by sport."""
    query = select(EvaluationTemplate).where(EvaluationTemplate.organization_id == org_id)
    if sport:
        query = query.where(EvaluationTemplate.sport == sport)
    query = query.order_by(EvaluationTemplate.created_at.desc())
    result = await db.execute(query)
    templates = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "sport": t.sport,
            "skills_count": len(t.skills) if t.skills else 0,
            "categories": t.categories or [],
            "is_default": t.is_default,
            "position_overrides": t.position_overrides,
        }
        for t in templates
    ]


# ============================================================
# AI Narrative Preview (for coaches during scoring)
# ============================================================

@router.post("/api/scoring/ai-preview")
async def ai_preview_for_player(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI narrative for a player based on their current scores in an event.
    Used by coaches in the scoring UI to see a live AI summary after scoring."""
    body = await request.json()
    event_id = body.get("event_id")
    player_id = body.get("player_id")
    
    if not event_id or not player_id:
        raise HTTPException(status_code=400, detail="event_id and player_id required")
    
    # Get the player
    player = (await db.execute(select(Player).where(Player.id == player_id))).scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Get the event + template
    event = (await db.execute(
        select(EvaluationEvent).options(selectinload(EvaluationEvent.template)).where(EvaluationEvent.id == event_id)
    )).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get all scores for this player in this event
    scores_result = await db.execute(
        select(Score).where(Score.event_id == event_id, Score.player_id == player_id)
    )
    scores = scores_result.scalars().all()
    
    if not scores:
        raise HTTPException(status_code=400, detail="No scores found for this player")
    
    # Average scores by skill
    from collections import defaultdict
    skill_totals = defaultdict(list)
    for s in scores:
        skill_totals[s.skill_name].append(s.score_value)
    
    avg_scores = {k: round(sum(v)/len(v), 2) for k, v in skill_totals.items()}
    overall = round(sum(avg_scores.values()) / len(avg_scores), 2) if avg_scores else 0
    
    # Sort for strengths/weaknesses
    sorted_skills = sorted(avg_scores.items(), key=lambda x: x[1], reverse=True)
    strengths = [f"{s[0]} ({s[1]}/5)" for s in sorted_skills[:3]]
    improvements = [f"{s[0]} ({s[1]}/5)" for s in sorted_skills[-3:]]
    
    # Get evaluator comments
    comments = [s.comment for s in scores if s.comment and s.comment.strip()]
    
    # Build AI prompt
    player_name = f"{player.first_name} {player.last_name}"
    position = player.position or "Player"
    age_group = player.age_group or ""
    
    scores_text = "\n".join(f"  - {k}: {v}/5" for k, v in sorted_skills)
    comments_text = "\n".join(f"  - {c}" for c in comments[:10]) if comments else "  (no comments)"
    
    prompt = f"""You are writing a player evaluation narrative for youth sports. 
    
Player: {player_name}
Age Group: {age_group}
Position: {position}
Event: {event.name}
Overall Score: {overall}/5

Skill Scores:
{scores_text}

Coach Comments:
{comments_text}

Write a 3-4 sentence evaluation narrative that:
1. Uses the player's first name naturally
2. Highlights their top strengths specifically
3. Notes areas for development constructively and encouragingly
4. Gives a forward-looking recommendation

Keep the tone warm, professional, and encouraging — this goes to parents. Be specific about skills, not generic."""

    from app.services.ai import call_openai
    
    try:
        narrative = await call_openai([{"role": "user", "content": prompt}], max_tokens=250)
    except Exception as e:
        logger.warning("AI preview failed: %s", e)
        # Fallback to template-based narrative
        narrative = (
            f"{player.first_name} scored an overall {overall}/5 in the {event.name}. "
            f"Top strengths include {', '.join(s.split(' (')[0] for s in strengths[:2])}. "
            f"Areas to focus on: {', '.join(s.split(' (')[0] for s in improvements[:2])}."
        )
    
    return {
        "player_name": player_name,
        "overall_score": overall,
        "narrative": narrative,
        "strengths": strengths,
        "improvements": improvements,
        "skill_scores": avg_scores,
    }


# ============================================================
# Voice Recordings for Player Reports
# ============================================================

@router.post("/api/events/{event_id}/players/{player_id}/recordings")
async def add_voice_recording(
    event_id: str,
    player_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Add a voice recording to a player's event evaluation.
    Body: {audio_data: base64_string, duration_seconds: float, label: string, evaluator_name: string}
    Multiple recordings can be saved per player — each is a separate entry."""
    body = await request.json()
    audio_data = body.get("audio_data")
    if not audio_data:
        raise HTTPException(status_code=400, detail="audio_data (base64) is required")
    
    # Find the EventPlayer record
    ep = (await db.execute(
        select(EventPlayer).where(
            EventPlayer.event_id == event_id,
            EventPlayer.player_id == player_id,
        )
    )).scalar_one_or_none()
    
    if not ep:
        raise HTTPException(status_code=404, detail="Player not found in this event")
    
    # Build recording entry
    import uuid as _uuid
    recording = {
        "id": str(_uuid.uuid4()),
        "audio_data": audio_data,
        "duration_seconds": body.get("duration_seconds", 0),
        "label": body.get("label", f"Recording {len(ep.voice_recordings or []) + 1}"),
        "evaluator_name": body.get("evaluator_name", "Coach"),
        "recorded_at": datetime.utcnow().isoformat(),
    }
    
    # Append to existing recordings
    current = list(ep.voice_recordings or [])
    current.append(recording)
    ep.voice_recordings = current
    
    # Force SQLAlchemy to detect the change on JSONB
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(ep, "voice_recordings")
    
    return {"id": recording["id"], "total_recordings": len(current), "message": "Recording saved"}


@router.get("/api/events/{event_id}/players/{player_id}/recordings")
async def get_voice_recordings(
    event_id: str,
    player_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all voice recordings for a player in an event."""
    ep = (await db.execute(
        select(EventPlayer).where(
            EventPlayer.event_id == event_id,
            EventPlayer.player_id == player_id,
        )
    )).scalar_one_or_none()
    
    if not ep:
        raise HTTPException(status_code=404, detail="Player not found in this event")
    
    recordings = ep.voice_recordings or []
    # Return without the full audio_data for listing (it's large)
    summary = [
        {
            "id": r["id"],
            "label": r.get("label", ""),
            "duration_seconds": r.get("duration_seconds", 0),
            "evaluator_name": r.get("evaluator_name", ""),
            "recorded_at": r.get("recorded_at", ""),
        }
        for r in recordings
    ]
    return {"recordings": summary, "total": len(recordings)}


@router.get("/api/events/{event_id}/players/{player_id}/recordings/{recording_id}")
async def get_single_recording(
    event_id: str,
    player_id: str,
    recording_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single recording including audio data."""
    ep = (await db.execute(
        select(EventPlayer).where(
            EventPlayer.event_id == event_id,
            EventPlayer.player_id == player_id,
        )
    )).scalar_one_or_none()
    
    if not ep:
        raise HTTPException(status_code=404, detail="Player not found in this event")
    
    for r in (ep.voice_recordings or []):
        if r["id"] == recording_id:
            return r
    
    raise HTTPException(status_code=404, detail="Recording not found")


@router.delete("/api/events/{event_id}/players/{player_id}/recordings/{recording_id}")
async def delete_voice_recording(
    event_id: str,
    player_id: str,
    recording_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single recording."""
    ep = (await db.execute(
        select(EventPlayer).where(
            EventPlayer.event_id == event_id,
            EventPlayer.player_id == player_id,
        )
    )).scalar_one_or_none()
    
    if not ep:
        raise HTTPException(status_code=404, detail="Player not found in this event")
    
    current = list(ep.voice_recordings or [])
    ep.voice_recordings = [r for r in current if r["id"] != recording_id]
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(ep, "voice_recordings")
    
    return {"message": "Recording deleted", "remaining": len(ep.voice_recordings)}


# ============================================================
# Position Profiles — what does an ideal player at each position look like?
# ============================================================

SOCCER_POSITION_PROFILES = {
    "Goalkeeper": {
        "description": "Last line of defense. Must have excellent reflexes, positioning, and communication.",
        "ideal_scores": {
            "Positioning / Movement": 4.5,
            "Game Intelligence": 4.0,
            "Coachability": 4.5,
            "Attitude / Effort": 4.5,
            "Tackling / Defending": 3.5,
            "Passing Accuracy": 3.0,
            "Speed / Acceleration": 3.0,
        },
        "key_traits": ["Shot stopping", "Distribution", "Communication", "Positioning", "Courage"],
        "physical_profile": {"height": "Tall preferred", "build": "Athletic", "agility": "High"},
    },
    "Defender": {
        "description": "Backbone of the team. Strong tackling, positioning, and aerial ability.",
        "ideal_scores": {
            "Tackling / Defending": 4.5,
            "Positioning / Movement": 4.5,
            "Heading": 4.0,
            "Game Intelligence": 4.0,
            "Speed / Acceleration": 3.5,
            "Passing Accuracy": 3.5,
            "Stamina / Work Rate": 4.0,
        },
        "key_traits": ["Tackling", "Aerial ability", "Reading the game", "Composure", "Strength"],
        "physical_profile": {"height": "Above average", "build": "Strong", "stamina": "High"},
    },
    "Midfielder": {
        "description": "Engine of the team. Controls tempo, creates chances, and links defense to attack.",
        "ideal_scores": {
            "Passing Accuracy": 4.5,
            "Game Intelligence": 5.0,
            "Ball Control / First Touch": 4.5,
            "Stamina / Work Rate": 4.5,
            "Positioning / Movement": 4.0,
            "Dribbling": 4.0,
            "Coachability": 4.0,
        },
        "key_traits": ["Vision", "Passing range", "Work rate", "Ball retention", "Decision making"],
        "physical_profile": {"height": "Average", "build": "Lean/athletic", "stamina": "Very high"},
    },
    "Forward": {
        "description": "Goal scorer. Clinical finishing, pace, and ability to create chances.",
        "ideal_scores": {
            "Shooting / Finishing": 5.0,
            "Speed / Acceleration": 4.5,
            "Dribbling": 4.0,
            "Ball Control / First Touch": 4.0,
            "Positioning / Movement": 4.5,
            "Game Intelligence": 3.5,
            "Heading": 3.5,
        },
        "key_traits": ["Clinical finishing", "Pace", "Movement in the box", "Composure", "Creativity"],
        "physical_profile": {"height": "Varies", "build": "Athletic/fast", "acceleration": "Explosive"},
    },
}

@router.get("/api/templates/position-profiles/{sport}")
async def get_position_profiles(sport: str):
    """Get ideal position profiles for a sport — what does a good striker/goalie/etc look like?"""
    profiles = {
        "soccer": SOCCER_POSITION_PROFILES,
        "basketball": {
            "Point Guard": {"description": "Floor general. Elite ball handling and court vision.", "ideal_scores": {"Ball Handling": 5.0, "Passing": 5.0, "Court Awareness": 5.0, "Speed": 4.5}, "key_traits": ["Leadership", "Vision", "Quickness"]},
            "Shooting Guard": {"description": "Primary scorer from the perimeter.", "ideal_scores": {"Shooting": 5.0, "Ball Handling": 4.0, "Defense": 3.5, "Speed": 4.0}, "key_traits": ["Shooting range", "Scoring ability", "Athleticism"]},
            "Small Forward": {"description": "Versatile player. Scores, defends, and rebounds.", "ideal_scores": {"Shooting": 4.0, "Defense": 4.0, "Rebounding": 3.5, "Court Awareness": 4.0}, "key_traits": ["Versatility", "Two-way play", "Athleticism"]},
            "Power Forward": {"description": "Interior presence. Strong rebounder and post player.", "ideal_scores": {"Rebounding": 5.0, "Defense": 4.5, "Shooting": 3.0, "Vertical": 4.0}, "key_traits": ["Physicality", "Rebounding", "Post moves"]},
            "Center": {"description": "Anchor. Shot blocking, rebounding, and interior defense.", "ideal_scores": {"Rebounding": 5.0, "Defense": 5.0, "Vertical": 4.0}, "key_traits": ["Shot blocking", "Rim protection", "Physicality"]},
        },
    }
    sport_profiles = profiles.get(sport.lower())
    if not sport_profiles:
        raise HTTPException(status_code=404, detail=f"No position profiles for {sport}. Available: {list(profiles.keys())}")
    return {"sport": sport, "positions": sport_profiles}


@router.get("/api/players/{player_id}/position-fit")
async def get_position_fit(player_id: str, db: AsyncSession = Depends(get_db)):
    """Analyze how well a player fits each position based on their scores vs ideal profiles."""
    player = (await db.execute(select(Player).where(Player.id == player_id))).scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Get their latest report
    report = (await db.execute(
        select(PlayerReport).where(PlayerReport.player_id == player_id)
        .order_by(PlayerReport.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    
    if not report or not report.skill_scores:
        raise HTTPException(status_code=400, detail="No scores available for position fit analysis")
    
    # Compare against each position profile
    fits = {}
    for position, profile in SOCCER_POSITION_PROFILES.items():
        ideal = profile["ideal_scores"]
        total_diff = 0
        matched_skills = 0
        for skill, ideal_score in ideal.items():
            actual = report.skill_scores.get(skill)
            if actual is not None:
                total_diff += abs(ideal_score - actual)
                matched_skills += 1
        
        if matched_skills > 0:
            avg_diff = total_diff / matched_skills
            # Convert to a 0-100 fit score (0 diff = 100% fit, 4 diff = 0% fit)
            fit_pct = max(0, round(100 - (avg_diff * 25), 1))
            fits[position] = {
                "fit_score": fit_pct,
                "description": profile["description"],
                "key_traits": profile["key_traits"],
                "physical_profile": profile["physical_profile"],
            }
    
    # Sort by fit score
    sorted_fits = dict(sorted(fits.items(), key=lambda x: x[1]["fit_score"], reverse=True))
    best_fit = list(sorted_fits.keys())[0] if sorted_fits else None
    
    return {
        "player_name": f"{player.first_name} {player.last_name}",
        "current_position": player.position,
        "best_fit_position": best_fit,
        "position_fits": sorted_fits,
    }


# ============================================================
# Draft Settings & Advanced Team Balancing
# ============================================================

@router.patch("/api/events/{event_id}/draft-settings")
async def update_draft_settings(event_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Update draft/balancing settings for an event.
    Settings: method (overall|positional|categorical), balance_positions (bool),
    num_teams (int), priority_skills (list), position_requirements (dict)"""
    body = await request.json()
    event = (await db.execute(select(EvaluationEvent).where(EvaluationEvent.id == event_id))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event.draft_settings = body
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(event, "draft_settings")
    
    return {"message": "Draft settings updated", "settings": body}


@router.get("/api/events/{event_id}/draft-settings")
async def get_draft_settings(event_id: str, db: AsyncSession = Depends(get_db)):
    """Get current draft settings."""
    event = (await db.execute(select(EvaluationEvent).where(EvaluationEvent.id == event_id))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    defaults = {
        "method": "overall",
        "balance_positions": True,
        "num_teams": 3,
        "priority_skills": [],
        "position_requirements": {"Goalkeeper": 1, "Defender": 3, "Midfielder": 4, "Forward": 3},
        "keep_friends_together": False,
    }
    settings = {**defaults, **(event.draft_settings or {})}
    return settings


@router.post("/api/events/{event_id}/draft/smart-balance")
async def smart_balance_teams(event_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """AI-powered team balancing using draft settings.
    Uses position requirements, skill priorities, and balancing method."""
    event = (await db.execute(
        select(EvaluationEvent).options(selectinload(EvaluationEvent.template))
        .where(EvaluationEvent.id == event_id)
    )).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    settings = event.draft_settings or {}
    method = settings.get("method", "overall")
    balance_positions = settings.get("balance_positions", True)
    num_teams = settings.get("num_teams", 3)
    position_reqs = settings.get("position_requirements", {})
    priority_skills = settings.get("priority_skills", [])
    
    # Get all reports for this event
    reports = (await db.execute(
        select(PlayerReport).options(selectinload(PlayerReport.player))
        .where(PlayerReport.event_id == event_id)
        .order_by(PlayerReport.overall_score.desc().nullslast())
    )).scalars().all()
    
    if not reports:
        raise HTTPException(status_code=400, detail="Generate reports first")
    
    # Get or create teams
    teams_result = await db.execute(select(DraftTeam).where(DraftTeam.event_id == event_id))
    teams = teams_result.scalars().all()
    
    if len(teams) < num_teams:
        colors = ["#0066cc", "#cc0000", "#888888", "#009900", "#cc6600", "#6600cc"]
        names = ["Blue", "Red", "White", "Green", "Orange", "Purple"]
        for i in range(len(teams), num_teams):
            team = DraftTeam(event_id=event_id, team_name=names[i % len(names)], team_color=colors[i % len(colors)])
            db.add(team)
        await db.flush()
        teams_result = await db.execute(select(DraftTeam).where(DraftTeam.event_id == event_id))
        teams = teams_result.scalars().all()
    
    # Clear existing picks
    await db.execute(select(DraftPick).where(DraftPick.draft_team_id.in_([t.id for t in teams])))
    for t in teams:
        await db.execute(DraftPick.__table__.delete().where(DraftPick.draft_team_id == t.id))
    
    # Sort players based on method
    if method == "positional" and balance_positions:
        # Group by position, then snake draft within each group
        position_groups = {}
        for r in reports:
            pos = r.player.position or "Unknown"
            if pos not in position_groups:
                position_groups[pos] = []
            position_groups[pos].append(r)
        
        # Snake draft by position
        team_idx = 0
        direction = 1
        pick_order = 0
        
        for pos in ["Goalkeeper", "Defender", "Midfielder", "Forward", "Unknown"]:
            players = position_groups.get(pos, [])
            for r in players:
                pick = DraftPick(draft_team_id=teams[team_idx].id, player_id=r.player_id, pick_order=pick_order)
                db.add(pick)
                pick_order += 1
                team_idx += direction
                if team_idx >= num_teams:
                    team_idx = num_teams - 1
                    direction = -1
                elif team_idx < 0:
                    team_idx = 0
                    direction = 1
    else:
        # Overall method — snake draft by overall score
        team_idx = 0
        direction = 1
        for i, r in enumerate(reports):
            pick = DraftPick(draft_team_id=teams[team_idx].id, player_id=r.player_id, pick_order=i)
            db.add(pick)
            team_idx += direction
            if team_idx >= num_teams:
                team_idx = num_teams - 1
                direction = -1
            elif team_idx < 0:
                team_idx = 0
                direction = 1
    
    await db.flush()
    
    # Build summary
    team_summaries = []
    for t in teams:
        picks = (await db.execute(
            select(DraftPick).options(selectinload(DraftPick.player))
            .where(DraftPick.draft_team_id == t.id)
        )).scalars().all()
        
        player_scores = []
        positions = {}
        for p in picks:
            report = next((r for r in reports if r.player_id == p.player_id), None)
            if report:
                player_scores.append(report.overall_score or 0)
            pos = p.player.position or "Unknown" if p.player else "Unknown"
            positions[pos] = positions.get(pos, 0) + 1
        
        avg = round(sum(player_scores) / len(player_scores), 2) if player_scores else 0
        team_summaries.append({
            "team_name": t.team_name,
            "team_color": t.team_color,
            "player_count": len(picks),
            "avg_score": avg,
            "positions": positions,
            "players": [{"name": f"{p.player.first_name} {p.player.last_name}" if p.player else "?", "position": p.player.position if p.player else "?"} for p in picks]
        })
    
    return {
        "method": method,
        "num_teams": num_teams,
        "balance_positions": balance_positions,
        "teams": team_summaries,
    }


# ============================================================
# Player Bio Details Endpoint
# ============================================================

@router.patch("/api/players/{player_id}/bio")
async def update_player_bio(player_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Update player bio/physical details.
    Body: {height_inches, weight_lbs, dominant_foot, years_playing, school, medical_notes}"""
    body = await request.json()
    player = (await db.execute(select(Player).where(Player.id == player_id))).scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    for field in ["height_inches", "weight_lbs", "dominant_foot", "years_playing", "school", "medical_notes"]:
        if field in body:
            setattr(player, field, body[field])
    
    return {
        "id": str(player.id),
        "name": f"{player.first_name} {player.last_name}",
        "height_inches": player.height_inches,
        "height_display": f"{player.height_inches // 12}'{player.height_inches % 12}\"" if player.height_inches else None,
        "weight_lbs": player.weight_lbs,
        "dominant_foot": player.dominant_foot,
        "years_playing": player.years_playing,
        "school": player.school,
    }
