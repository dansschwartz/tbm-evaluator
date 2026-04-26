import logging
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.models import (Base, Organization, EvaluationTemplate, Player, EvaluationEvent, EventPlayer, Evaluator, Score, PlayerReport, DraftTeam, DraftPick, APIToken, PlayMetricsImport, Field, FieldBooking, Season, Program, Team, TeamRoster, ScheduleEntry, Message, MessageRecipient, AttendanceRecord, ClubHealthScore, BestPracticeAssessment, ClubLifecycleScore, PlayerDevelopmentPath, RegistrationForecast, ParentEngagement, SeasonReport, CompetitionResult, ComplianceItem, PlayerDocument, TrainingProgram, ProgramWeek, ProgramSession, ChatThread, ChatMessage, PlayerVideo, AutomationRule, BookableSlot, Booking)
from app.routers import (
    analytics, draft, evaluators, events, features, notifications,
    organizations, players, reports, scoring, templates,
    # TBM Operations modules
    imports, fields, seasons, teams, schedules, ai_ops,
    communications, coaches, attendance, ops_analytics, documents,
    intelligence,
    onboarding,
    # Tier 1+2 features
    programs, messaging, videos, automations, bookings,
)
from app.routers.templates import SPORT_PRESETS

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TBM Operations — AI-Native Sports Club Platform",
    version="4.0.0",
    description="AI-Native Sports Club Operating System — 100+ features including player evaluation, scoring, reports, drafting, PlayMetrics import, field management, season/program management, team management, scheduling engine, AI operations assistant, communication center, coach management, attendance tracking, analytics dashboard, document vault, Club Health Score, IYSL Best Practice Assessment, Club Lifecycle Predictor, Player Development Pathways, Registration Forecasting, Parent Engagement, Financial Dashboard, Seasonal Reports, Competition Intelligence, and Compliance Dashboard.",
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

# Intelligence & Benchmarking
app.include_router(intelligence.router)

# Onboarding
app.include_router(onboarding.router)

# Tier 1+2 features
app.include_router(programs.router)
app.include_router(messaging.router)
app.include_router(videos.router)
app.include_router(automations.router)
app.include_router(bookings.router)

# Static files
app.mount("/marketing/static", StaticFiles(directory="marketing"), name="marketing_static")
app.mount("/launcher/static", StaticFiles(directory="launcher"), name="launcher_static")
app.mount("/admin/static", StaticFiles(directory="admin"), name="admin_static")
app.mount("/score/static", StaticFiles(directory="scoring"), name="scoring_static")
app.mount("/report/static", StaticFiles(directory="reports"), name="report_static")
app.mount("/parent/static", StaticFiles(directory="parent"), name="parent_static")
app.mount("/self-assess/static", StaticFiles(directory="selfassess"), name="selfassess_static")
app.mount("/onboard/static", StaticFiles(directory="onboard"), name="onboard_static")

async def run_migrations(conn):
    """Add new columns to existing tables. Safe to run repeatedly."""
    migrations = [
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(500)",
        "ALTER TABLE evaluation_templates ADD COLUMN IF NOT EXISTS position_overrides JSONB",
        "ALTER TABLE evaluation_templates ADD COLUMN IF NOT EXISTS position_profiles JSONB",
        "ALTER TABLE evaluation_events ADD COLUMN IF NOT EXISTS season VARCHAR(100)",
        "ALTER TABLE evaluation_events ADD COLUMN IF NOT EXISTS draft_settings JSONB",
        "ALTER TABLE event_players ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP",
        "ALTER TABLE event_players ADD COLUMN IF NOT EXISTS general_notes TEXT",
        "ALTER TABLE event_players ADD COLUMN IF NOT EXISTS self_assessment JSONB",
        "ALTER TABLE event_players ADD COLUMN IF NOT EXISTS voice_recordings JSONB",
        "ALTER TABLE player_reports ADD COLUMN IF NOT EXISTS weighted_overall_score FLOAT",
        "ALTER TABLE player_reports ADD COLUMN IF NOT EXISTS ai_progress_narrative TEXT",
        "ALTER TABLE player_reports ADD COLUMN IF NOT EXISTS development_plan JSONB",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS height_inches INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS weight_lbs INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS dominant_foot VARCHAR(10)",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS years_playing INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS school VARCHAR(255)",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS medical_notes TEXT",
        "ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS certifications JSONB",
        "ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS availability JSONB",
        "ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS background_check_status VARCHAR(50)",
        "ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS volunteer_hours FLOAT",
        "ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        # Fields enhancements
        "ALTER TABLE fields ADD COLUMN IF NOT EXISTS field_rating FLOAT",
        "ALTER TABLE fields ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0",
        "ALTER TABLE fields ADD COLUMN IF NOT EXISTS permit_cost_per_hour FLOAT",
        "ALTER TABLE fields ADD COLUMN IF NOT EXISTS permit_shared_with VARCHAR(500)",
        "ALTER TABLE fields ADD COLUMN IF NOT EXISTS permit_notes TEXT",
        "ALTER TABLE fields ADD COLUMN IF NOT EXISTS weather_cancellations INTEGER DEFAULT 0",
        # Player home ward for drive-time analysis
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS home_ward VARCHAR(10)",
        "CREATE TABLE IF NOT EXISTS training_programs (id UUID PRIMARY KEY, org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, player_id UUID REFERENCES players(id) ON DELETE SET NULL, template_name VARCHAR(255), sport VARCHAR(50) DEFAULT 'soccer', duration_weeks INTEGER DEFAULT 4, phase_name VARCHAR(100), status VARCHAR(50) DEFAULT 'draft', created_by VARCHAR(255), ai_generated BOOLEAN DEFAULT FALSE, notes TEXT, created_at TIMESTAMP DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS program_weeks (id UUID PRIMARY KEY, program_id UUID REFERENCES training_programs(id) ON DELETE CASCADE, week_number INTEGER, focus TEXT, notes TEXT)",
        "CREATE TABLE IF NOT EXISTS program_sessions (id UUID PRIMARY KEY, week_id UUID REFERENCES program_weeks(id) ON DELETE CASCADE, day_of_week VARCHAR(20), session_type VARCHAR(50), exercises JSONB DEFAULT '[]'::jsonb)",
        "CREATE TABLE IF NOT EXISTS chat_threads (id UUID PRIMARY KEY, org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, thread_type VARCHAR(50), title VARCHAR(255), participants JSONB DEFAULT '[]'::jsonb, player_id UUID, team_id UUID, created_at TIMESTAMP DEFAULT NOW(), last_message_at TIMESTAMP DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS chat_messages (id UUID PRIMARY KEY, thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE, sender_name VARCHAR(255), sender_role VARCHAR(50), content TEXT, attachments JSONB DEFAULT '[]'::jsonb, read_by JSONB DEFAULT '[]'::jsonb, created_at TIMESTAMP DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS player_videos (id UUID PRIMARY KEY, player_id UUID REFERENCES players(id) ON DELETE CASCADE, org_id UUID, event_id UUID, title VARCHAR(255), description TEXT, video_data TEXT, thumbnail_data TEXT, duration_seconds FLOAT, tags JSONB DEFAULT '[]'::jsonb, ai_analysis TEXT, uploaded_by VARCHAR(255), created_at TIMESTAMP DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS automation_rules (id UUID PRIMARY KEY, org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, name VARCHAR(255), trigger_event VARCHAR(100), conditions JSONB DEFAULT '{}'::jsonb, actions JSONB DEFAULT '[]'::jsonb, enabled BOOLEAN DEFAULT TRUE, run_count INTEGER DEFAULT 0, last_run_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS bookable_slots (id UUID PRIMARY KEY, org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, title VARCHAR(255), slot_type VARCHAR(50), capacity INTEGER, booked_count INTEGER DEFAULT 0, start_time TIMESTAMP, end_time TIMESTAMP, location VARCHAR(255), price FLOAT, description TEXT, coach_name VARCHAR(255), active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS bookings (id UUID PRIMARY KEY, slot_id UUID REFERENCES bookable_slots(id) ON DELETE CASCADE, player_id UUID REFERENCES players(id) ON DELETE CASCADE, parent_name VARCHAR(255), parent_email VARCHAR(255), status VARCHAR(50) DEFAULT 'confirmed', booked_at TIMESTAMP DEFAULT NOW(), notes TEXT)",
    ]
    for sql in migrations:
        try:
            await conn.execute(text(sql))
        except Exception:
            pass  # Column already exists or table doesn't exist yet

@app.on_event("startup")
async def startup():
    logger.info("Running migrations...")
    async with engine.begin() as conn:
        await run_migrations(conn)
    logger.info("Migrations complete.")

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
    return {"status": "healthy", "service": "tbm-operations", "version": "5.0.0", "features": 105}

# Serve frontend pages
@app.get("/marketing")
@app.get("/marketing/")
async def marketing_page():
    return FileResponse("marketing/index.html")

@app.get("/")
async def launcher_page():
    return FileResponse("launcher/index.html")

@app.get("/onboard")
@app.get("/onboard/")
async def onboard_page():
    return FileResponse("onboard/index.html")

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
