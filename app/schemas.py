from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# --- Organization ---
class OrganizationCreate(BaseModel):
    name: str
    slug: str
    sport: str = "soccer"
    logo_url: Optional[str] = None
    primary_color: str = "#09A1A1"
    secondary_color: str = "#5484A4"
    contact_email: Optional[str] = None
    settings: dict = {}


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    contact_email: Optional[str] = None
    settings: Optional[dict] = None
    active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    api_key: Optional[str] = None
    sport: str
    logo_url: Optional[str] = None
    primary_color: str
    secondary_color: str
    contact_email: Optional[str] = None
    settings: dict = {}
    created_at: Optional[datetime] = None
    active: bool

    model_config = {"from_attributes": True}


# --- Template ---
class SkillDefinition(BaseModel):
    name: str
    category: str
    scoring_type: str = "scale_1_5"
    weight: float = 1.0
    description: str = ""


class TemplateCreate(BaseModel):
    name: str
    sport: str = "soccer"
    skills: list[SkillDefinition] = []
    categories: list[str] = []
    is_default: bool = False


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    skills: Optional[list[SkillDefinition]] = None
    categories: Optional[list[str]] = None
    is_default: Optional[bool] = None


class TemplateResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    sport: str
    skills: list = []
    categories: list = []
    is_default: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Player ---
class PlayerCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: Optional[date] = None
    age_group: Optional[str] = None
    position: Optional[str] = None
    jersey_number: Optional[int] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    metadata: dict = {}


class PlayerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    age_group: Optional[str] = None
    position: Optional[str] = None
    jersey_number: Optional[int] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    metadata: Optional[dict] = None
    active: Optional[bool] = None


class PlayerResponse(BaseModel):
    id: UUID
    organization_id: UUID
    first_name: str
    last_name: str
    date_of_birth: Optional[date] = None
    age_group: Optional[str] = None
    position: Optional[str] = None
    jersey_number: Optional[int] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    active: bool = True

    model_config = {"from_attributes": True}


# --- Event ---
class EventCreate(BaseModel):
    template_id: Optional[UUID] = None
    name: str
    event_type: str = "tryout"
    event_date: Optional[date] = None
    location: Optional[str] = None
    status: str = "draft"
    settings: dict = {}


class EventUpdate(BaseModel):
    name: Optional[str] = None
    template_id: Optional[UUID] = None
    event_type: Optional[str] = None
    event_date: Optional[date] = None
    location: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[dict] = None


class EventResponse(BaseModel):
    id: UUID
    organization_id: UUID
    template_id: Optional[UUID] = None
    name: str
    event_type: str
    event_date: Optional[date] = None
    location: Optional[str] = None
    status: str
    settings: dict = {}
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EventPlayerAdd(BaseModel):
    player_ids: list[UUID]


class EventPlayerResponse(BaseModel):
    id: UUID
    event_id: UUID
    player_id: UUID
    checked_in: bool = False
    bib_number: Optional[int] = None
    assigned_group: Optional[str] = None
    player: Optional[PlayerResponse] = None

    model_config = {"from_attributes": True}


# --- Evaluator ---
class EvaluatorCreate(BaseModel):
    name: str
    email: Optional[str] = None


class EvaluatorResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    email: Optional[str] = None
    access_code: str
    active: bool

    model_config = {"from_attributes": True}


class EvaluatorLogin(BaseModel):
    access_code: str


# --- Scoring ---
class ScoreSubmit(BaseModel):
    player_id: UUID
    skill_name: str
    score_value: float
    comment: Optional[str] = None
    video_url: Optional[str] = None


class ScoreBatchSubmit(BaseModel):
    evaluator_id: UUID
    event_id: UUID
    scores: list[ScoreSubmit]


class ScoreResponse(BaseModel):
    id: UUID
    event_id: UUID
    player_id: UUID
    evaluator_id: UUID
    skill_name: str
    score_value: float
    comment: Optional[str] = None
    video_url: Optional[str] = None
    scored_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Report ---
class ReportResponse(BaseModel):
    id: UUID
    event_id: UUID
    player_id: UUID
    organization_id: UUID
    overall_score: Optional[float] = None
    skill_scores: dict = {}
    rank: Optional[int] = None
    total_players: Optional[int] = None
    ai_summary: Optional[str] = None
    ai_strengths: list = []
    ai_improvements: list = []
    ai_recommendation: Optional[str] = None
    report_url: Optional[str] = None
    sent_to_parent: bool = False
    sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    player: Optional[PlayerResponse] = None

    model_config = {"from_attributes": True}


# --- Draft ---
class DraftTeamCreate(BaseModel):
    team_names: list[str]
    team_colors: Optional[list[str]] = None


class DraftTeamResponse(BaseModel):
    id: UUID
    event_id: UUID
    team_name: str
    team_color: Optional[str] = None
    picks: list = []

    model_config = {"from_attributes": True}


class DraftPickCreate(BaseModel):
    team_id: UUID
    player_id: UUID


class DraftPickResponse(BaseModel):
    id: UUID
    draft_team_id: UUID
    player_id: UUID
    pick_order: int
    picked_at: Optional[datetime] = None
    player: Optional[PlayerResponse] = None

    model_config = {"from_attributes": True}


# --- Analytics ---
class DashboardAnalytics(BaseModel):
    total_organizations: int = 0
    total_players: int = 0
    total_events: int = 0
    total_evaluations: int = 0
    recent_events: list = []


class EventAnalytics(BaseModel):
    total_players: int = 0
    total_scores: int = 0
    total_evaluators: int = 0
    avg_overall_score: Optional[float] = None
    score_distribution: dict = {}
    top_performers: list = []
    skill_averages: dict = {}
