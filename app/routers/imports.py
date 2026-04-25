"""Module 1: PlayMetrics Data Import"""
import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PlayMetricsImport, Player
from app.routers.auth import verify_admin_key
from app.schemas import ImportSummary, PlayMetricsImportRequest, PlayMetricsImportResponse

router = APIRouter(tags=["PlayMetrics Import"], dependencies=[Depends(verify_admin_key)])

# Common PlayMetrics column mappings
COLUMN_MAP = {
    "first name": "first_name",
    "firstname": "first_name",
    "first": "first_name",
    "last name": "last_name",
    "lastname": "last_name",
    "last": "last_name",
    "date of birth": "date_of_birth",
    "dob": "date_of_birth",
    "birthdate": "date_of_birth",
    "birth date": "date_of_birth",
    "email": "parent_email",
    "parent email": "parent_email",
    "parent/guardian email": "parent_email",
    "guardian email": "parent_email",
    "phone": "parent_phone",
    "parent phone": "parent_phone",
    "parent/guardian phone": "parent_phone",
    "parent/guardian name": "parent_name",
    "parent name": "parent_name",
    "guardian name": "parent_name",
    "guardian": "parent_name",
    "grade": "age_group",
    "age group": "age_group",
    "division": "age_group",
    "gender": "gender",
    "sex": "gender",
    "team": "team",
    "team name": "team",
    "program": "program",
    "program name": "program",
    "position": "position",
    "jersey": "jersey_number",
    "jersey number": "jersey_number",
    "number": "jersey_number",
    "school": "school",
}


def auto_detect_columns(headers: list[str]) -> dict[int, str]:
    """Map CSV column indices to player fields."""
    mapping = {}
    for i, header in enumerate(headers):
        normalized = header.strip().lower()
        if normalized in COLUMN_MAP:
            mapping[i] = COLUMN_MAP[normalized]
    return mapping


def parse_date(val: str):
    """Try common date formats."""
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(val.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_rows(csv_text: str) -> tuple[list[dict], list[str]]:
    """Parse CSV text into list of player dicts."""
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return [], ["Empty CSV"]

    headers = rows[0]
    col_map = auto_detect_columns(headers)

    if "first_name" not in col_map.values() or "last_name" not in col_map.values():
        return [], ["Could not detect First Name and Last Name columns. Found headers: " + ", ".join(headers)]

    players = []
    errors = []
    for row_idx, row in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in row):
            continue
        player_data = {}
        for col_idx, field in col_map.items():
            if col_idx < len(row):
                val = row[col_idx].strip()
                if val:
                    if field == "date_of_birth":
                        parsed = parse_date(val)
                        if parsed:
                            player_data[field] = parsed
                        else:
                            errors.append(f"Row {row_idx}: Invalid date '{val}'")
                    elif field == "jersey_number":
                        try:
                            player_data[field] = int(val)
                        except ValueError:
                            pass
                    else:
                        player_data[field] = val

        if player_data.get("first_name") and player_data.get("last_name"):
            players.append(player_data)
        else:
            errors.append(f"Row {row_idx}: Missing first or last name")

    return players, errors


@router.post("/api/organizations/{org_id}/imports/preview")
async def preview_import(org_id: uuid.UUID, req: PlayMetricsImportRequest, db: AsyncSession = Depends(get_db)):
    """Preview what would be imported (dry run)."""
    players, errors = parse_rows(req.csv_data)

    imported = 0
    updated = 0
    skipped = 0
    for p in players:
        query = select(Player).where(
            Player.organization_id == org_id,
            Player.first_name == p["first_name"],
            Player.last_name == p["last_name"],
        )
        if p.get("date_of_birth"):
            query = query.where(Player.date_of_birth == p["date_of_birth"])
        existing = (await db.execute(query)).scalars().first()
        if existing:
            updated += 1
        else:
            imported += 1

    return ImportSummary(imported=imported, updated=updated, skipped=skipped, errors=errors)


@router.post("/api/organizations/{org_id}/imports/playmetrics")
async def import_playmetrics(org_id: uuid.UUID, req: PlayMetricsImportRequest, db: AsyncSession = Depends(get_db)):
    """Import players from PlayMetrics CSV data."""
    players, errors = parse_rows(req.csv_data)

    import_record = PlayMetricsImport(
        org_id=org_id,
        import_type=req.import_type,
        status="processing",
        row_count=len(players),
        raw_data=req.csv_data,
    )
    db.add(import_record)

    imported = 0
    updated = 0
    for p in players:
        query = select(Player).where(
            Player.organization_id == org_id,
            Player.first_name == p["first_name"],
            Player.last_name == p["last_name"],
        )
        if p.get("date_of_birth"):
            query = query.where(Player.date_of_birth == p["date_of_birth"])

        existing = (await db.execute(query)).scalars().first()

        if existing:
            for key, val in p.items():
                if key not in ("first_name", "last_name", "team", "program", "gender"):
                    setattr(existing, key, val)
            updated += 1
        else:
            new_player = Player(
                organization_id=org_id,
                first_name=p["first_name"],
                last_name=p["last_name"],
                date_of_birth=p.get("date_of_birth"),
                age_group=p.get("age_group"),
                position=p.get("position"),
                jersey_number=p.get("jersey_number"),
                parent_name=p.get("parent_name"),
                parent_email=p.get("parent_email"),
                parent_phone=p.get("parent_phone"),
                school=p.get("school"),
            )
            db.add(new_player)
            imported += 1

    import_record.imported_count = imported + updated
    import_record.errors = errors
    import_record.status = "completed"

    await db.flush()

    return {
        "import_id": str(import_record.id),
        "imported": imported,
        "updated": updated,
        "skipped": 0,
        "errors": errors,
        "total_rows": len(players),
    }


@router.get("/api/organizations/{org_id}/imports")
async def list_imports(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """List import history."""
    result = await db.execute(
        select(PlayMetricsImport)
        .where(PlayMetricsImport.org_id == org_id)
        .order_by(PlayMetricsImport.created_at.desc())
    )
    imports = result.scalars().all()
    return [PlayMetricsImportResponse.model_validate(i) for i in imports]
