import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    api_key = Column(String(255), nullable=True)
    sport = Column(String(100), default="soccer")
    logo_url = Column(String(500), nullable=True)
    primary_color = Column(String(7), default="#09A1A1")
    secondary_color = Column(String(7), default="#5484A4")
    contact_email = Column(String(255), nullable=True)
    settings = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    active = Column(Boolean, default=True)
    # Feature 17: Webhook notifications
    webhook_url = Column(String(500), nullable=True)

    templates = relationship("EvaluationTemplate", back_populates="organization", cascade="all, delete-orphan")
    players = relationship("Player", back_populates="organization", cascade="all, delete-orphan")
    events = relationship("EvaluationEvent", back_populates="organization", cascade="all, delete-orphan")
    evaluators = relationship("Evaluator", back_populates="organization", cascade="all, delete-orphan")
    reports = relationship("PlayerReport", back_populates="organization", cascade="all, delete-orphan")


class EvaluationTemplate(Base):
    __tablename__ = "evaluation_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    sport = Column(String(100), default="soccer")
    skills = Column(JSONB, default=list)
    categories = Column(JSONB, default=list)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    # Feature 15: Position-based template variants
    position_overrides = Column(JSONB, nullable=True)
    # Ideal position profiles — what scores should a good striker/goalie/etc have?
    # Format: {"Striker": {"Shooting": 4.5, "Speed": 4.0, ...}, "Goalkeeper": {...}}
    position_profiles = Column(JSONB, nullable=True)

    organization = relationship("Organization", back_populates="templates")
    events = relationship("EvaluationEvent", back_populates="template")


class Player(Base):
    __tablename__ = "players"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    age_group = Column(String(50), nullable=True)
    position = Column(String(100), nullable=True)
    jersey_number = Column(Integer, nullable=True)
    # Bio / physical details
    height_inches = Column(Integer, nullable=True)  # Height in inches (e.g., 58 = 4'10")
    weight_lbs = Column(Integer, nullable=True)     # Weight in pounds
    dominant_foot = Column(String(10), nullable=True)  # left, right, both
    years_playing = Column(Integer, nullable=True)   # Years of experience
    school = Column(String(255), nullable=True)
    medical_notes = Column(Text, nullable=True)      # Allergies, conditions (private)
    home_ward = Column(String(10), nullable=True)    # NW/NE/SW/SE — for drive-time analysis
    parent_name = Column(String(255), nullable=True)
    parent_email = Column(String(255), nullable=True)
    parent_phone = Column(String(50), nullable=True)
    photo_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    active = Column(Boolean, default=True)

    organization = relationship("Organization", back_populates="players")
    event_players = relationship("EventPlayer", back_populates="player", cascade="all, delete-orphan")
    scores = relationship("Score", back_populates="player", cascade="all, delete-orphan")
    reports = relationship("PlayerReport", back_populates="player", cascade="all, delete-orphan")
    draft_picks = relationship("DraftPick", back_populates="player", cascade="all, delete-orphan")


class EvaluationEvent(Base):
    __tablename__ = "evaluation_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_templates.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    event_type = Column(String(50), default="tryout")
    event_date = Column(Date, nullable=True)
    location = Column(String(255), nullable=True)
    status = Column(String(50), default="draft")
    settings = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    # Feature 16: Season/Year grouping
    season = Column(String(100), nullable=True)
    # Draft/balancing settings
    # Format: {"method": "overall"|"positional"|"categorical", "balance_positions": true/false,
    #          "num_teams": 3, "priority_skills": ["Game Intelligence", "Coachability"],
    #          "keep_friends_together": false, "position_requirements": {"Goalkeeper": 1, "Defender": 3}}
    draft_settings = Column(JSONB, nullable=True)

    organization = relationship("Organization", back_populates="events")
    template = relationship("EvaluationTemplate", back_populates="events")
    event_players = relationship("EventPlayer", back_populates="event", cascade="all, delete-orphan")
    scores = relationship("Score", back_populates="event", cascade="all, delete-orphan")
    reports = relationship("PlayerReport", back_populates="event", cascade="all, delete-orphan")
    draft_teams = relationship("DraftTeam", back_populates="event", cascade="all, delete-orphan")


class EventPlayer(Base):
    __tablename__ = "event_players"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_events.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    checked_in = Column(Boolean, default=False)
    bib_number = Column(Integer, nullable=True)
    assigned_group = Column(String(100), nullable=True)
    # Feature 1: QR check-in timestamp
    checked_in_at = Column(DateTime, nullable=True)
    # Feature 9: General notes per player per event
    general_notes = Column(Text, nullable=True)
    # Voice recordings — array of {id, audio_data (base64), duration_seconds, label, recorded_at, evaluator_name}
    voice_recordings = Column(JSONB, nullable=True, default=list)
    # Feature 12: Self-assessment data
    self_assessment = Column(JSONB, nullable=True)

    event = relationship("EvaluationEvent", back_populates="event_players")
    player = relationship("Player", back_populates="event_players")


class Evaluator(Base):
    __tablename__ = "evaluators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    access_code = Column(String(6), nullable=False, unique=True)
    active = Column(Boolean, default=True)
    # Module 8: Coach management extensions
    phone = Column(String(50), nullable=True)
    certifications = Column(JSONB, nullable=True)  # [{name, expiry, status}]
    background_check_status = Column(String(50), nullable=True)  # pending/cleared/expired
    availability = Column(JSONB, nullable=True)  # {mon: ["16:00-20:00"], ...}
    volunteer_hours = Column(Float, nullable=True, default=0)

    organization = relationship("Organization", back_populates="evaluators")
    scores = relationship("Score", back_populates="evaluator", cascade="all, delete-orphan")


class Score(Base):
    __tablename__ = "scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_events.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    evaluator_id = Column(UUID(as_uuid=True), ForeignKey("evaluators.id", ondelete="CASCADE"), nullable=False)
    skill_name = Column(String(255), nullable=False)
    score_value = Column(Float, nullable=False)
    comment = Column(Text, nullable=True)
    video_url = Column(String(500), nullable=True)
    scored_at = Column(DateTime, server_default=func.now())

    event = relationship("EvaluationEvent", back_populates="scores")
    player = relationship("Player", back_populates="scores")
    evaluator = relationship("Evaluator", back_populates="scores")


class PlayerReport(Base):
    __tablename__ = "player_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_events.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    overall_score = Column(Float, nullable=True)
    # Feature 10: explicit weighted score
    weighted_overall_score = Column(Float, nullable=True)
    skill_scores = Column(JSONB, default=dict)
    rank = Column(Integer, nullable=True)
    total_players = Column(Integer, nullable=True)
    ai_summary = Column(Text, nullable=True)
    ai_strengths = Column(JSONB, default=list)
    ai_improvements = Column(JSONB, default=list)
    ai_recommendation = Column(Text, nullable=True)
    # Feature 22: AI progress narrative
    ai_progress_narrative = Column(Text, nullable=True)
    # AI-generated custom development/work plan based on scores + position
    development_plan = Column(JSONB, nullable=True)  # {drills: [{name, description, skill_target, duration, frequency}], focus_areas: [], position_notes: str}
    report_url = Column(String(500), nullable=True)
    sent_to_parent = Column(Boolean, default=False)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    event = relationship("EvaluationEvent", back_populates="reports")
    player = relationship("Player", back_populates="reports")
    organization = relationship("Organization", back_populates="reports")


class DraftTeam(Base):
    __tablename__ = "draft_teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_events.id", ondelete="CASCADE"), nullable=False)
    team_name = Column(String(255), nullable=False)
    team_color = Column(String(7), nullable=True)

    event = relationship("EvaluationEvent", back_populates="draft_teams")
    picks = relationship("DraftPick", back_populates="team", cascade="all, delete-orphan")


class DraftPick(Base):
    __tablename__ = "draft_picks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    draft_team_id = Column(UUID(as_uuid=True), ForeignKey("draft_teams.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    pick_order = Column(Integer, nullable=False)
    picked_at = Column(DateTime, server_default=func.now())

    team = relationship("DraftTeam", back_populates="picks")
    player = relationship("Player", back_populates="draft_picks")


# Feature 25: API auth tokens
class APIToken(Base):
    __tablename__ = "api_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True)


# ============================================================
# TBM OPERATIONS — Modules 1-11
# ============================================================

# Module 1: PlayMetrics Data Import
class PlayMetricsImport(Base):
    __tablename__ = "playmetrics_imports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    import_type = Column(String(50), default="roster")  # roster/program/team
    status = Column(String(50), default="pending")  # pending/processing/completed/failed
    row_count = Column(Integer, default=0)
    imported_count = Column(Integer, default=0)
    errors = Column(JSONB, default=list)
    raw_data = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# Module 2: Field/Facility Management
class Field(Base):
    __tablename__ = "fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    location_address = Column(String(500), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    surface_type = Column(String(50), nullable=True)  # grass/turf/indoor
    size = Column(String(50), nullable=True)  # full/3_4/half/small
    has_lights = Column(Boolean, default=False)
    capacity = Column(Integer, nullable=True)
    permitted_hours = Column(JSONB, nullable=True)  # {mon: ["16:00-20:00"], ...}
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    # Feature: Field Quality Ratings
    field_rating = Column(Float, nullable=True)
    rating_count = Column(Integer, default=0)
    # Feature: Permit Cost Tracking
    permit_cost_per_hour = Column(Float, nullable=True)
    # Feature: Shared Permit Tracking
    permit_shared_with = Column(String(500), nullable=True)
    permit_notes = Column(Text, nullable=True)
    # Feature: Historical Weather Cancellations
    weather_cancellations = Column(Integer, default=0)

    bookings = relationship("FieldBooking", back_populates="field", cascade="all, delete-orphan")


class FieldBooking(Base):
    __tablename__ = "field_bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_id = Column(UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(50), default="practice")  # practice/game/tournament/clinic
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    recurring = Column(Boolean, default=False)
    recurrence_rule = Column(JSONB, nullable=True)
    status = Column(String(50), default="confirmed")  # confirmed/tentative/cancelled
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    field = relationship("Field", back_populates="bookings")
    team = relationship("Team", back_populates="field_bookings")


# Module 3: Season & Program Management
class Season(Base):
    __tablename__ = "seasons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    registration_open_date = Column(Date, nullable=True)
    registration_close_date = Column(Date, nullable=True)
    status = Column(String(50), default="planning")  # planning/registration/active/completed
    settings = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())

    programs = relationship("Program", back_populates="season", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="season", cascade="all, delete-orphan")
    schedule_entries = relationship("ScheduleEntry", back_populates="season", cascade="all, delete-orphan")


class Program(Base):
    __tablename__ = "programs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    season_id = Column(UUID(as_uuid=True), ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    program_type = Column(String(50), default="recreational")  # recreational/travel/academy/camp/clinic/tournament
    age_groups = Column(JSONB, default=list)
    gender = Column(String(20), default="coed")  # coed/boys/girls
    max_players_per_team = Column(Integer, nullable=True)
    max_teams = Column(Integer, nullable=True)
    registration_fee = Column(Float, nullable=True)
    early_bird_fee = Column(Float, nullable=True)
    late_fee = Column(Float, nullable=True)
    financial_aid_eligible = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    season = relationship("Season", back_populates="programs")
    teams = relationship("Team", back_populates="program", cascade="all, delete-orphan")


# Module 4: Advanced Team Management
class Team(Base):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    program_id = Column(UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), nullable=True)
    season_id = Column(UUID(as_uuid=True), ForeignKey("seasons.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    team_level = Column(String(100), nullable=True)  # Blue/Red/Select
    head_coach_id = Column(UUID(as_uuid=True), ForeignKey("evaluators.id", ondelete="SET NULL"), nullable=True)
    assistant_coaches = Column(JSONB, default=list)  # array of evaluator IDs
    max_roster_size = Column(Integer, nullable=True)
    practice_day = Column(String(20), nullable=True)
    practice_time = Column(String(20), nullable=True)
    practice_field_id = Column(UUID(as_uuid=True), ForeignKey("fields.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    program = relationship("Program", back_populates="teams")
    season = relationship("Season", back_populates="teams")
    head_coach = relationship("Evaluator", foreign_keys=[head_coach_id])
    practice_field = relationship("Field", foreign_keys=[practice_field_id])
    roster = relationship("TeamRoster", back_populates="team", cascade="all, delete-orphan")
    field_bookings = relationship("FieldBooking", back_populates="team", cascade="all, delete-orphan")
    schedule_entries = relationship("ScheduleEntry", back_populates="team", foreign_keys="ScheduleEntry.team_id")
    attendance_records = relationship("AttendanceRecord", back_populates="team", cascade="all, delete-orphan")


class TeamRoster(Base):
    __tablename__ = "team_rosters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    jersey_number = Column(Integer, nullable=True)
    role = Column(String(50), default="player")  # player/captain/alternate
    joined_at = Column(DateTime, server_default=func.now())
    status = Column(String(50), default="active")  # active/injured/suspended/released

    team = relationship("Team", back_populates="roster")
    player = relationship("Player")


# Module 5: Scheduling Engine
class ScheduleEntry(Base):
    __tablename__ = "schedule_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    season_id = Column(UUID(as_uuid=True), ForeignKey("seasons.id", ondelete="SET NULL"), nullable=True)
    entry_type = Column(String(50), default="practice")  # practice/game/event
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    opponent_team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    field_id = Column(UUID(as_uuid=True), ForeignKey("fields.id", ondelete="SET NULL"), nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="scheduled")  # scheduled/cancelled/completed
    weather_status = Column(String(50), default="clear")  # clear/delayed/cancelled
    referee_ids = Column(JSONB, default=list)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    season = relationship("Season", back_populates="schedule_entries")
    team = relationship("Team", back_populates="schedule_entries", foreign_keys=[team_id])
    opponent_team = relationship("Team", foreign_keys=[opponent_team_id])
    field = relationship("Field")
    attendance_records = relationship("AttendanceRecord", back_populates="schedule_entry", cascade="all, delete-orphan")


# Module 7: Communication Center
class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True)
    channel = Column(String(20), default="email")  # email/sms
    audience_type = Column(String(50), default="all")  # all/program/team/age_group/custom
    audience_filter = Column(JSONB, nullable=True)
    status = Column(String(50), default="draft")  # draft/scheduled/sent
    scheduled_for = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    recipient_count = Column(Integer, default=0)
    open_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    recipients = relationship("MessageRecipient", back_populates="message", cascade="all, delete-orphan")


class MessageRecipient(Base):
    __tablename__ = "message_recipients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    parent_email = Column(String(255), nullable=True)
    parent_phone = Column(String(50), nullable=True)
    delivery_status = Column(String(50), default="pending")  # pending/sent/delivered/bounced
    opened = Column(Boolean, default=False)
    sent_at = Column(DateTime, nullable=True)

    message = relationship("Message", back_populates="recipients")
    player = relationship("Player")


# Module 9: Attendance Tracking
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    schedule_entry_id = Column(UUID(as_uuid=True), ForeignKey("schedule_entries.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="present")  # present/absent/late/excused
    check_in_time = Column(DateTime, nullable=True)
    recorded_by = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    schedule_entry = relationship("ScheduleEntry", back_populates="attendance_records")
    player = relationship("Player")
    team = relationship("Team", back_populates="attendance_records")


# ============================================================
# INTELLIGENCE & BENCHMARKING — Version 4.0
# ============================================================

class ClubHealthScore(Base):
    __tablename__ = "club_health_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, nullable=False)  # 0-100
    breakdown = Column(JSONB, default=dict)  # {retention_rate, coach_ratio, financial_aid_pct, gender_equity, fill_rate, development_progression, parent_satisfaction}
    benchmarks = Column(JSONB, default=dict)  # {all_clubs_avg, top_10_pct}
    ai_narrative = Column(Text, nullable=True)
    generated_at = Column(DateTime, server_default=func.now())


class BestPracticeAssessment(Base):
    __tablename__ = "best_practice_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    respondent_name = Column(String(255), nullable=False)
    respondent_role = Column(String(50), nullable=False)  # leader/staff/coach/customer
    responses = Column(JSONB, default=dict)  # {Q1: 60, Q2: 80, ...Q60: 40}
    completed_at = Column(DateTime, server_default=func.now())


class ClubLifecycleScore(Base):
    __tablename__ = "club_lifecycle_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    overall_phase = Column(Integer, nullable=False)  # 1-5
    factor_scores = Column(JSONB, default=dict)  # 10 factors with phase ratings
    ai_analysis = Column(Text, nullable=True)
    generated_at = Column(DateTime, server_default=func.now())


class PlayerDevelopmentPath(Base):
    __tablename__ = "player_development_paths"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    path_entries = Column(JSONB, default=list)  # [{season, program, level, age_group, evaluation_score, date}]
    current_level = Column(String(100), nullable=True)
    predicted_next_level = Column(String(100), nullable=True)
    ai_prediction = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    player = relationship("Player")


class RegistrationForecast(Base):
    __tablename__ = "registration_forecasts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    season = Column(String(100), nullable=False)
    forecast_data = Column(JSONB, default=dict)  # {program: {predicted_count, confidence, trend}}
    ai_narrative = Column(Text, nullable=True)
    generated_at = Column(DateTime, server_default=func.now())


class ParentEngagement(Base):
    __tablename__ = "parent_engagements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    engagement_score = Column(Float, nullable=False)  # 0-100
    factors = Column(JSONB, default=dict)  # {email_opens, event_attendance, volunteer_hours, survey_responses, payment_timeliness}
    risk_level = Column(String(20), nullable=False, default="healthy")  # healthy/watch/at_risk
    ai_notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    player = relationship("Player")


class SeasonReport(Base):
    __tablename__ = "season_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    season = Column(String(100), nullable=False)
    report_type = Column(String(20), nullable=False)  # monthly/seasonal/annual
    content = Column(JSONB, default=dict)
    ai_executive_summary = Column(Text, nullable=True)
    generated_at = Column(DateTime, server_default=func.now())


class CompetitionResult(Base):
    __tablename__ = "competition_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    opponent_name = Column(String(255), nullable=False)
    league = Column(String(255), nullable=True)
    match_date = Column(Date, nullable=False)
    result = Column(String(10), nullable=False)  # win/loss/draw
    score_for = Column(Integer, default=0)
    score_against = Column(Integer, default=0)
    goal_scorers = Column(JSONB, default=list)  # [{player_id, player_name, count}]
    assists = Column(JSONB, default=list)  # [{player_id, player_name, count}]
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    team = relationship("Team")


class ComplianceItem(Base):
    __tablename__ = "compliance_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    item_type = Column(String(50), nullable=False)  # background_check/safesport/insurance/concussion_training/first_aid
    person_name = Column(String(255), nullable=False)
    person_role = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="missing")  # compliant/expiring/expired/missing
    expiry_date = Column(Date, nullable=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("player_documents.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# Module 11: Document Vault
class PlayerDocument(Base):
    __tablename__ = "player_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    document_type = Column(String(50), default="other")  # waiver/medical/birth_cert/photo_id/other
    file_name = Column(String(500), nullable=True)
    file_data = Column(Text, nullable=True)  # base64 encoded
    mime_type = Column(String(100), nullable=True)
    uploaded_by = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    doc_player = relationship("Player")


# ══════════════════════════════════════════════════════════════════
# TIER 1+2 FEATURES
# ══════════════════════════════════════════════════════════════════

# Feature: Training Program Builder
class TrainingProgram(Base):
    __tablename__ = "training_programs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    template_name = Column(String(255), nullable=True)
    sport = Column(String(100), default="soccer")
    duration_weeks = Column(Integer, default=4)
    phase_name = Column(String(100), nullable=True)  # Off-Season, Pre-Season, In-Season
    status = Column(String(50), default="draft")  # draft/active/completed
    created_by = Column(String(255), nullable=True)
    ai_generated = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    assigned_player = relationship("Player")
    weeks = relationship("ProgramWeek", back_populates="program", cascade="all, delete-orphan")


class ProgramWeek(Base):
    __tablename__ = "program_weeks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id = Column(UUID(as_uuid=True), ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False)
    week_number = Column(Integer, nullable=False)
    focus = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    program = relationship("TrainingProgram", back_populates="weeks")
    sessions = relationship("ProgramSession", back_populates="week", cascade="all, delete-orphan")


class ProgramSession(Base):
    __tablename__ = "program_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week_id = Column(UUID(as_uuid=True), ForeignKey("program_weeks.id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(String(20), nullable=True)
    session_type = Column(String(50), nullable=True)  # strength/speed/skill/recovery/game
    exercises = Column(JSONB, default=list)  # [{name, sets, reps, intensity, notes, video_url}]

    week = relationship("ProgramWeek", back_populates="sessions")


# Feature: In-App Messaging
class ChatThread(Base):
    __tablename__ = "chat_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    thread_type = Column(String(50), default="direct")  # direct/team/announcement
    title = Column(String(500), nullable=True)
    participants = Column(JSONB, default=list)  # [{id, name, role}]
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_message_at = Column(DateTime, nullable=True)

    organization = relationship("Organization")
    thread_player = relationship("Player")
    messages = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id = Column(UUID(as_uuid=True), ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False)
    sender_name = Column(String(255), nullable=True)
    sender_role = Column(String(50), nullable=True)  # coach/parent/admin
    content = Column(Text, nullable=True)
    attachments = Column(JSONB, default=list)  # [{name, url, type}]
    read_by = Column(JSONB, default=list)
    created_at = Column(DateTime, server_default=func.now())

    thread = relationship("ChatThread", back_populates="messages")


# Feature: Video Upload + AI Analysis
class PlayerVideo(Base):
    __tablename__ = "player_videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_events.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    video_data = Column(Text, nullable=True)  # base64 encoded
    thumbnail_data = Column(Text, nullable=True)  # base64 encoded
    duration_seconds = Column(Float, nullable=True)
    tags = Column(JSONB, default=list)
    ai_analysis = Column(Text, nullable=True)
    uploaded_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    video_player = relationship("Player")
    organization = relationship("Organization")


# Feature: Automation Workflows
class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    trigger_event = Column(String(100), nullable=False)
    conditions = Column(JSONB, default=dict)
    actions = Column(JSONB, default=list)  # [{type, params}]
    enabled = Column(Boolean, default=True)
    run_count = Column(Integer, default=0)
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")


# Feature: Self-Service Booking
class BookableSlot(Base):
    __tablename__ = "bookable_slots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    slot_type = Column(String(50), default="camp")  # camp/clinic/training/assessment
    capacity = Column(Integer, default=20)
    booked_count = Column(Integer, default=0)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    location = Column(String(500), nullable=True)
    price = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    coach_name = Column(String(255), nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    slot_bookings = relationship("Booking", back_populates="slot", cascade="all, delete-orphan")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slot_id = Column(UUID(as_uuid=True), ForeignKey("bookable_slots.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    parent_name = Column(String(255), nullable=True)
    parent_email = Column(String(255), nullable=True)
    status = Column(String(50), default="confirmed")  # confirmed/waitlisted/cancelled
    booked_at = Column(DateTime, server_default=func.now())
    notes = Column(Text, nullable=True)

    slot = relationship("BookableSlot", back_populates="slot_bookings")
    booking_player = relationship("Player")
