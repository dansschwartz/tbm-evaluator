import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import EvaluationTemplate
from app.routers.auth import verify_admin_key
from app.schemas import TemplateCreate, TemplateResponse, TemplateUpdate

router = APIRouter(tags=["templates"])

SPORT_PRESETS = {
    "soccer": {
        "name": "Soccer Evaluation",
        "categories": ["Technical", "Tactical", "Physical", "Mental"],
        "skills": [
            {"name": "Ball Control / First Touch", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Ability to receive and control the ball cleanly"},
            {"name": "Dribbling", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Ball control while moving, ability to beat defenders"},
            {"name": "Passing Accuracy", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Accuracy and weight of short and long passes"},
            {"name": "Shooting / Finishing", "category": "Technical", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Shot accuracy, power, and technique"},
            {"name": "Heading", "category": "Technical", "scoring_type": "scale_1_5", "weight": 0.5, "description": "Aerial ability and heading technique"},
            {"name": "Tackling / Defending", "category": "Tactical", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Defensive positioning and tackling technique"},
            {"name": "Positioning / Movement", "category": "Tactical", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Off-the-ball movement and spatial awareness"},
            {"name": "Game Intelligence", "category": "Tactical", "scoring_type": "scale_1_5", "weight": 1.5, "description": "Decision making, vision, and reading the game"},
            {"name": "Speed / Acceleration", "category": "Physical", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Sprint speed and acceleration"},
            {"name": "Stamina / Work Rate", "category": "Physical", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Endurance and consistent effort throughout"},
            {"name": "Coachability", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.2, "description": "Willingness to learn and respond to coaching"},
            {"name": "Attitude / Effort", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Positive attitude, hustle, and sportsmanship"},
        ],
    },
    "basketball": {
        "name": "Basketball Evaluation",
        "categories": ["Offensive", "Defensive", "Athletic", "Mental"],
        "skills": [
            {"name": "Shooting", "category": "Offensive", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Shooting form, accuracy, and range"},
            {"name": "Ball Handling", "category": "Offensive", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Dribbling skills and ball control"},
            {"name": "Passing", "category": "Offensive", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Passing accuracy and vision"},
            {"name": "Rebounding", "category": "Defensive", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Boxing out and securing rebounds"},
            {"name": "Defense", "category": "Defensive", "scoring_type": "scale_1_5", "weight": 1.0, "description": "On-ball and help defense"},
            {"name": "Court Awareness", "category": "Offensive", "scoring_type": "scale_1_5", "weight": 1.2, "description": "Understanding of spacing and game flow"},
            {"name": "Free Throws", "category": "Offensive", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Free throw shooting percentage and form"},
            {"name": "Speed", "category": "Athletic", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Speed in transition and lateral movement"},
            {"name": "Vertical", "category": "Athletic", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Vertical leap and explosiveness"},
            {"name": "Teamwork", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Communication and team play"},
            {"name": "Coachability", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.2, "description": "Willingness to learn and respond to coaching"},
        ],
    },
    "baseball": {
        "name": "Baseball Evaluation",
        "categories": ["Offense", "Defense", "Athletic", "Mental"],
        "skills": [
            {"name": "Hitting", "category": "Offense", "scoring_type": "scale_1_5", "weight": 1.2, "description": "Swing mechanics, contact, and power"},
            {"name": "Fielding", "category": "Defense", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Glove work, positioning, and fielding technique"},
            {"name": "Throwing", "category": "Defense", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Arm strength, accuracy, and mechanics"},
            {"name": "Base Running", "category": "Athletic", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Speed, instincts, and base running intelligence"},
            {"name": "Pitching", "category": "Defense", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Pitching mechanics, control, and velocity"},
            {"name": "Catching", "category": "Defense", "scoring_type": "scale_1_5", "weight": 0.8, "description": "Receiving, blocking, and throwing from behind the plate"},
            {"name": "Game IQ", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.2, "description": "Understanding of game situations and strategy"},
            {"name": "Hustle", "category": "Athletic", "scoring_type": "scale_1_5", "weight": 1.0, "description": "Effort and energy on every play"},
            {"name": "Coachability", "category": "Mental", "scoring_type": "scale_1_5", "weight": 1.2, "description": "Willingness to learn and respond to coaching"},
        ],
    },
}


@router.post("/api/organizations/{org_id}/templates", response_model=TemplateResponse, dependencies=[Depends(verify_admin_key)])
async def create_template(org_id: uuid.UUID, data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    template = EvaluationTemplate(
        id=uuid.uuid4(),
        organization_id=org_id,
        name=data.name,
        sport=data.sport,
        skills=[s.model_dump() for s in data.skills],
        categories=data.categories,
        is_default=data.is_default,
        position_overrides=data.position_overrides,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.get("/api/organizations/{org_id}/templates", response_model=list[TemplateResponse], dependencies=[Depends(verify_admin_key)])
async def list_templates(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EvaluationTemplate)
        .where(EvaluationTemplate.organization_id == org_id)
        .order_by(EvaluationTemplate.created_at.desc())
    )
    return result.scalars().all()


@router.get("/api/templates/{template_id}", response_model=TemplateResponse, dependencies=[Depends(verify_admin_key)])
async def get_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    template = await db.get(EvaluationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/api/templates/{template_id}", response_model=TemplateResponse, dependencies=[Depends(verify_admin_key)])
async def update_template(template_id: uuid.UUID, data: TemplateUpdate, db: AsyncSession = Depends(get_db)):
    template = await db.get(EvaluationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = data.model_dump(exclude_unset=True)
    if "skills" in update_data and update_data["skills"] is not None:
        update_data["skills"] = [s.model_dump() if hasattr(s, "model_dump") else s for s in update_data["skills"]]

    for key, value in update_data.items():
        setattr(template, key, value)

    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/api/templates/{template_id}", dependencies=[Depends(verify_admin_key)])
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    template = await db.get(EvaluationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    return {"status": "deleted"}


@router.get("/api/templates/presets/{sport}")
async def get_sport_preset(sport: str):
    preset = SPORT_PRESETS.get(sport.lower())
    if not preset:
        raise HTTPException(status_code=404, detail=f"No preset found for sport: {sport}. Available: {list(SPORT_PRESETS.keys())}")
    return preset
