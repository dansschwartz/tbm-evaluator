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
