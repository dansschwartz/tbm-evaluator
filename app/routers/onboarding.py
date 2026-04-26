"""
Onboarding Router — Quick setup for new clubs.
Single endpoint that creates everything a new club needs.
"""

import uuid
import random
import string
from datetime import date
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.database import async_session
from app.models import Organization, EvaluationTemplate, Season, Program, Field, Evaluator

router = APIRouter(tags=["Onboarding"])

PROGRAM_DEFAULTS = {
    "recreational": {
        "name": "Rec League", "fee": 145, "financial_aid": True,
        "max_teams": 20, "max_players": 15, "age_groups": ["K", "1st", "2nd", "3rd", "4th", "5th", "6th"],
        "description": "Fun, inclusive recreational soccer for all skill levels. Everyone plays!",
    },
    "travel": {
        "name": "Travel Program", "fee": 2500, "financial_aid": False,
        "max_teams": 16, "max_players": 18, "age_groups": ["U8", "U9", "U10", "U11", "U12", "U13", "U14"],
        "description": "Competitive travel soccer with tryouts. Teams compete in regional leagues.",
    },
    "academy": {
        "name": "Academy", "fee": 3500, "financial_aid": False,
        "max_teams": 8, "max_players": 20, "age_groups": ["U11", "U12", "U13", "U14", "U15"],
        "description": "Elite development program with advanced coaching and college prep pathway.",
    },
    "camps": {
        "name": "Summer Camp", "fee": 350, "financial_aid": True,
        "max_teams": 10, "max_players": 20, "age_groups": ["K", "1st", "2nd", "3rd", "4th", "5th", "6th"],
        "description": "Week-long soccer camps with skills training, scrimmages, and fun.",
    },
    "clinics": {
        "name": "Skills Clinic", "fee": 200, "financial_aid": True,
        "max_teams": 8, "max_players": 15, "age_groups": ["U8", "U10", "U12"],
        "description": "Focused skills development clinics for targeted improvement.",
    },
}

DEFAULT_SOCCER_CATEGORIES = ["Technical", "Tactical", "Physical", "Mental"]
DEFAULT_SOCCER_SKILLS = [
    {"name": "Ball Control", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Passing", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Shooting", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Dribbling", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Game Intelligence", "category": "Tactical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Positioning", "category": "Tactical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Speed & Agility", "category": "Physical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Stamina", "category": "Physical", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Coachability", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.0},
    {"name": "Competitiveness", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.0},
]


class QuickSetupIn(BaseModel):
    club_name: str
    club_slug: str
    sport: str = "soccer"
    contact_email: str
    contact_name: str
    primary_color: str = "#003366"
    secondary_color: str = "#CC9933"
    admin_name: Optional[str] = None
    programs: list[str] = ["recreational", "travel"]
    age_groups: list[str] = ["U8", "U10", "U12"]
    num_fields: int = 2
    estimated_players: int = 200


@router.post("/api/onboarding/quick-setup")
async def quick_setup(data: QuickSetupIn):
    async with async_session() as session:
        async with session.begin():
            # 1. Create Organization
            org_id = uuid.uuid4()
            api_key = f"tbm-{uuid.uuid4().hex[:16]}"
            org = Organization(
                id=org_id,
                name=data.club_name,
                slug=data.club_slug,
                api_key=api_key,
                sport=data.sport,
                primary_color=data.primary_color,
                secondary_color=data.secondary_color,
                contact_email=data.contact_email,
                settings={
                    "age_groups": data.age_groups,
                    "estimated_players": data.estimated_players,
                },
                active=True,
            )
            session.add(org)

            # 2. Create default evaluation template
            template_id = uuid.uuid4()
            template = EvaluationTemplate(
                id=template_id,
                organization_id=org_id,
                name=f"Default {data.sport.title()} Evaluation",
                sport=data.sport,
                skills=DEFAULT_SOCCER_SKILLS,
                categories=DEFAULT_SOCCER_CATEGORIES,
                is_default=True,
            )
            session.add(template)

            # 3. Create Season (Spring 2026)
            season_id = uuid.uuid4()
            season = Season(
                id=season_id,
                org_id=org_id,
                name="Spring 2026",
                start_date=date(2026, 4, 18),
                end_date=date(2026, 6, 14),
                registration_open_date=date(2026, 3, 1),
                registration_close_date=date(2026, 4, 15),
                status="active",
            )
            session.add(season)

            # 4. Create Programs
            program_records = []
            for prog_type in data.programs:
                defaults = PROGRAM_DEFAULTS.get(prog_type, PROGRAM_DEFAULTS["recreational"])
                prog_id = uuid.uuid4()
                program = Program(
                    id=prog_id,
                    org_id=org_id,
                    season_id=season_id,
                    name=defaults["name"],
                    program_type=prog_type,
                    age_groups=data.age_groups or defaults["age_groups"],
                    gender="coed",
                    registration_fee=defaults["fee"],
                    financial_aid_eligible=defaults["financial_aid"],
                    max_teams=defaults["max_teams"],
                    max_players_per_team=defaults["max_players"],
                    description=defaults["description"],
                )
                session.add(program)
                program_records.append({
                    "id": str(prog_id), "name": defaults["name"], "type": prog_type,
                })

            # 5. Create placeholder Fields
            field_records = []
            for i in range(1, data.num_fields + 1):
                field_id = uuid.uuid4()
                field = Field(
                    id=field_id,
                    org_id=org_id,
                    name=f"Field {i}",
                    surface_type="turf",
                    size="full",
                    has_lights=True,
                )
                session.add(field)
                field_records.append({"id": str(field_id), "name": f"Field {i}"})

            # 6. Create admin Evaluator
            evaluator_id = uuid.uuid4()
            admin_name = data.admin_name or data.contact_name
            access_code = ''.join(random.choices(string.digits, k=6))
            evaluator = Evaluator(
                id=evaluator_id,
                organization_id=org_id,
                name=admin_name,
                email=data.contact_email,
                access_code=access_code,
                active=True,
            )
            session.add(evaluator)

    # 7. Return everything
    return {
        "organization": {
            "id": str(org_id),
            "name": data.club_name,
            "slug": data.club_slug,
            "api_key": api_key,
        },
        "template_id": str(template_id),
        "season_id": str(season_id),
        "programs": program_records,
        "fields": field_records,
        "admin_evaluator": {
            "id": str(evaluator_id),
            "name": admin_name,
            "access_code": access_code,
        },
        "getting_started": [
            "Log into the Admin Dashboard at /admin",
            "Add your players manually or import from PlayMetrics",
            "Create evaluation events for tryouts",
            "Set up your season schedule",
            "Configure coach certifications",
            "Invite parents to the Parent Portal at /parent",
        ],
    }
