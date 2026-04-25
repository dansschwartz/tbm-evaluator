import logging
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine
from app.models import Base, EvaluationTemplate, Organization
from app.routers import (
    analytics, draft, evaluators, events, features, notifications,
    organizations, players, reports, scoring, templates,
    # TBM Operations modules
    imports, fields, seasons, teams, schedules, ai_ops,
    communications, coaches, attendance, ops_analytics, documents,
)
from app.routers.templates import SPORT_PRESETS

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TBM Operations — AI-Native Sports Club Platform",
    version="3.0.0",
    description="AI-Native Sports Club Operating System — 70+ features including player evaluation, scoring, reports, drafting, PlayMetrics import, field management, season/program management, team management, scheduling engine, AI operations assistant, communication center, coach management, attendance tracking, analytics dashboard, and document vault.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(organizations.router)
app.include_router(templates.router)
app.include_router(players.router)
app.include_router(events.router)
app.include_router(evaluators.router)
app.include_router(scoring.router)
app.include_router(reports.router)
app.include_router(draft.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
app.include_router(features.router)

# TBM Operations routers
app.include_router(imports.router)
app.include_router(fields.router)
app.include_router(seasons.router)
app.include_router(teams.router)
app.include_router(schedules.router)
app.include_router(ai_ops.router)
app.include_router(communications.router)
app.include_router(coaches.router)
app.include_router(attendance.router)
app.include_router(ops_analytics.router)
app.include_router(documents.router)

# Static files
app.mount("/admin/static", StaticFiles(directory="admin"), name="admin_static")
app.mount("/score/static", StaticFiles(directory="scoring"), name="scoring_static")
app.mount("/report/static", StaticFiles(directory="reports"), name="report_static")
app.mount("/parent/static", StaticFiles(directory="parent"), name="parent_static")
app.mount("/self-assess/static", StaticFiles(directory="selfassess"), name="selfassess_static")


@app.on_event("startup")
async def startup():
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created.")

    # Seed default templates if none exist
    from app.database import async_session
    async with async_session() as session:
        from sqlalchemy import select, func
        count = (await session.execute(
            select(func.count()).select_from(EvaluationTemplate).where(EvaluationTemplate.is_default == True)
        )).scalar()

        if count == 0:
            for sport_key, preset in SPORT_PRESETS.items():
                template = EvaluationTemplate(
                    id=uuid.uuid4(),
                    organization_id=None,
                    name=preset["name"],
                    sport=sport_key,
                    skills=preset["skills"],
                    categories=preset["categories"],
                    is_default=True,
                )
                session.add(template)
            await session.commit()
            logger.info("Seeded default evaluation templates.")


@app.on_event("shutdown")
async def shutdown():
    from app.services.ai import close_client
    await close_client()
    from app.services.webhooks import close_webhook_client
    await close_webhook_client()


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "tbm-operations", "version": "3.0.0", "features": 70}


# Serve frontend pages
@app.get("/admin")
@app.get("/admin/")
async def admin_page():
    return FileResponse("admin/index.html")


@app.get("/score")
@app.get("/score/")
async def scoring_page():
    return FileResponse("scoring/index.html")


@app.get("/report/{report_id}")
async def report_page(report_id: str):
    return FileResponse("reports/index.html")


# Feature 11: Parent portal
@app.get("/parent")
@app.get("/parent/")
async def parent_page():
    return FileResponse("parent/index.html")


# Feature 12: Self-assessment
@app.get("/self-assess")
@app.get("/self-assess/")
async def self_assess_page():
    return FileResponse("selfassess/index.html")
