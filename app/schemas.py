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
    webhook_url: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    contact_email: Optional[str] = None
    settings: Optional[dict] = None
    active: Optional[bool] = None
    webhook_url: Optional[str] = None


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
    webhook_url: Optional[str] = None

    model_config = {"from_attributes": True}


# --- Template ---
class SkillDefinition(BaseModel):
    name: str
    category: str
    scoring_type: str = "scale_1_5"
    weight: float = 1.0
    description: str = ""
    rubric_descriptions: Optional[dict] = None


class TemplateCreate(BaseModel):
    name: str
    sport: str = "soccer"
    skills: list[SkillDefinition] = []
    categories: list[str] = []
    is_default: bool = False
    position_overrides: Optional[dict] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    skills: Optional[list[SkillDefinition]] = None
    categories: Optional[list[str]] = None
    is_default: Optional[bool] = None
    position_overrides: Optional[dict] = None


class TemplateResponse(BaseModel):
    id: UUID
    organization_id: Optional[UUID] = None
    name: str
    sport: str
    skills: list = []
    categories: list = []
    is_default: bool
    created_at: Optional[datetime] = None
    position_overrides: Optional[dict] = None

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
    season: Optional[str] = None


class EventUpdate(BaseModel):
    name: Optional[str] = None
    template_id: Optional[UUID] = None
    event_type: Optional[str] = None
    event_date: Optional[date] = None
    location: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[dict] = None
    season: Optional[str] = None


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
    season: Optional[str] = None

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
    checked_in_at: Optional[datetime] = None
    general_notes: Optional[str] = None
    self_assessment: Optional[dict] = None
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
    weighted_overall_score: Optional[float] = None
    skill_scores: dict = {}
    rank: Optional[int] = None
    total_players: Optional[int] = None
    ai_summary: Optional[str] = None
    ai_strengths: list = []
    ai_improvements: list = []
    ai_recommendation: Optional[str] = None
    ai_progress_narrative: Optional[str] = None
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


# --- Feature 9: Notes ---
class NotesSubmit(BaseModel):
    event_id: UUID
    player_id: UUID
    notes: str


# --- Feature 12: Self-assessment ---
class SelfAssessmentSubmit(BaseModel):
    player_code: Optional[str] = None
    player_id: Optional[UUID] = None
    scores: dict = {}


# --- Feature 23: Natural language scoring ---
class NaturalLanguageInput(BaseModel):
    text: str
    event_id: Optional[UUID] = None


# --- Feature 20: AI Coach ---
class AICoachQuestion(BaseModel):
    organization_id: UUID
    question: str


# --- Feature 25: API Tokens ---
class TokenCreate(BaseModel):
    name: Optional[str] = None


class TokenResponse(BaseModel):
    id: UUID
    organization_id: UUID
    token: str
    name: Optional[str] = None
    created_at: Optional[datetime] = None
    active: bool

    model_config = {"from_attributes": True}


# --- Feature 6: CSV Import ---
class CSVImportResult(BaseModel):
    imported: int
    errors: list[str] = []


# --- Feature 8: Photo upload ---
class PhotoUpload(BaseModel):
    photo_data: str


# ============================================================
# TBM OPERATIONS — Schemas for Modules 1-11
# ============================================================

# --- Module 1: PlayMetrics Import ---
class PlayMetricsImportRequest(BaseModel):
    csv_data: str
    import_type: str = "roster"


class PlayMetricsImportResponse(BaseModel):
    id: UUID
    org_id: UUID
    import_type: str
    status: str
    row_count: int
    imported_count: int
    errors: list = []
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ImportSummary(BaseModel):
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = []


# --- Module 2: Field Management ---
class FieldCreate(BaseModel):
    name: str
    location_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    surface_type: Optional[str] = None
    size: Optional[str] = None
    has_lights: bool = False
    capacity: Optional[int] = None
    permitted_hours: Optional[dict] = None
    notes: Optional[str] = None
    permit_cost_per_hour: Optional[float] = None
    permit_shared_with: Optional[str] = None
    permit_notes: Optional[str] = None


class FieldUpdate(BaseModel):
    name: Optional[str] = None
    location_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    surface_type: Optional[str] = None
    size: Optional[str] = None
    has_lights: Optional[bool] = None
    capacity: Optional[int] = None
    permitted_hours: Optional[dict] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    permit_cost_per_hour: Optional[float] = None
    permit_shared_with: Optional[str] = None
    permit_notes: Optional[str] = None


class FieldResponse(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    location_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    surface_type: Optional[str] = None
    size: Optional[str] = None
    has_lights: bool = False
    capacity: Optional[int] = None
    permitted_hours: Optional[dict] = None
    notes: Optional[str] = None
    active: bool = True
    created_at: Optional[datetime] = None
    field_rating: Optional[float] = None
    rating_count: int = 0
    permit_cost_per_hour: Optional[float] = None
    permit_shared_with: Optional[str] = None
    permit_notes: Optional[str] = None
    weather_cancellations: int = 0

    model_config = {"from_attributes": True}


class FieldBookingCreate(BaseModel):
    event_type: str = "practice"
    team_id: Optional[UUID] = None
    title: Optional[str] = None
    start_time: datetime
    end_time: datetime
    recurring: bool = False
    recurrence_rule: Optional[dict] = None
    status: str = "confirmed"
    notes: Optional[str] = None


class FieldBookingUpdate(BaseModel):
    event_type: Optional[str] = None
    team_id: Optional[UUID] = None
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    recurring: Optional[bool] = None
    recurrence_rule: Optional[dict] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class FieldBookingResponse(BaseModel):
    id: UUID
    field_id: UUID
    event_type: str
    team_id: Optional[UUID] = None
    title: Optional[str] = None
    start_time: datetime
    end_time: datetime
    recurring: bool = False
    recurrence_rule: Optional[dict] = None
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Module 3: Season & Program ---
class SeasonCreate(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    registration_open_date: Optional[date] = None
    registration_close_date: Optional[date] = None
    status: str = "planning"
    settings: dict = {}


class SeasonUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    registration_open_date: Optional[date] = None
    registration_close_date: Optional[date] = None
    status: Optional[str] = None
    settings: Optional[dict] = None


class SeasonResponse(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    registration_open_date: Optional[date] = None
    registration_close_date: Optional[date] = None
    status: str
    settings: dict = {}
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProgramCreate(BaseModel):
    season_id: UUID
    name: str
    program_type: str = "recreational"
    age_groups: list = []
    gender: str = "coed"
    max_players_per_team: Optional[int] = None
    max_teams: Optional[int] = None
    registration_fee: Optional[float] = None
    early_bird_fee: Optional[float] = None
    late_fee: Optional[float] = None
    financial_aid_eligible: bool = False
    description: Optional[str] = None


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    program_type: Optional[str] = None
    age_groups: Optional[list] = None
    gender: Optional[str] = None
    max_players_per_team: Optional[int] = None
    max_teams: Optional[int] = None
    registration_fee: Optional[float] = None
    early_bird_fee: Optional[float] = None
    late_fee: Optional[float] = None
    financial_aid_eligible: Optional[bool] = None
    description: Optional[str] = None


class ProgramResponse(BaseModel):
    id: UUID
    org_id: UUID
    season_id: UUID
    name: str
    program_type: str
    age_groups: list = []
    gender: str
    max_players_per_team: Optional[int] = None
    max_teams: Optional[int] = None
    registration_fee: Optional[float] = None
    early_bird_fee: Optional[float] = None
    late_fee: Optional[float] = None
    financial_aid_eligible: bool = False
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Module 4: Team Management ---
class TeamCreate(BaseModel):
    program_id: Optional[UUID] = None
    season_id: Optional[UUID] = None
    name: str
    team_level: Optional[str] = None
    head_coach_id: Optional[UUID] = None
    assistant_coaches: list = []
    max_roster_size: Optional[int] = None
    practice_day: Optional[str] = None
    practice_time: Optional[str] = None
    practice_field_id: Optional[UUID] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    program_id: Optional[UUID] = None
    season_id: Optional[UUID] = None
    team_level: Optional[str] = None
    head_coach_id: Optional[UUID] = None
    assistant_coaches: Optional[list] = None
    max_roster_size: Optional[int] = None
    practice_day: Optional[str] = None
    practice_time: Optional[str] = None
    practice_field_id: Optional[UUID] = None
    lineup: Optional[dict] = None


class TeamResponse(BaseModel):
    id: UUID
    org_id: UUID
    program_id: Optional[UUID] = None
    season_id: Optional[UUID] = None
    name: str
    team_level: Optional[str] = None
    head_coach_id: Optional[UUID] = None
    assistant_coaches: list = []
    max_roster_size: Optional[int] = None
    practice_day: Optional[str] = None
    practice_time: Optional[str] = None
    practice_field_id: Optional[UUID] = None
    lineup: Optional[dict] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TeamRosterAdd(BaseModel):
    player_id: UUID
    jersey_number: Optional[int] = None
    role: str = "player"


class TeamRosterResponse(BaseModel):
    id: UUID
    team_id: UUID
    player_id: UUID
    jersey_number: Optional[int] = None
    role: str
    joined_at: Optional[datetime] = None
    status: str

    model_config = {"from_attributes": True}


# --- Module 5: Scheduling Engine ---
class ScheduleEntryCreate(BaseModel):
    season_id: Optional[UUID] = None
    entry_type: str = "practice"
    team_id: Optional[UUID] = None
    opponent_team_id: Optional[UUID] = None
    field_id: Optional[UUID] = None
    start_time: datetime
    end_time: datetime
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "scheduled"
    referee_ids: list = []
    notes: Optional[str] = None


class ScheduleEntryUpdate(BaseModel):
    entry_type: Optional[str] = None
    team_id: Optional[UUID] = None
    opponent_team_id: Optional[UUID] = None
    field_id: Optional[UUID] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    weather_status: Optional[str] = None
    referee_ids: Optional[list] = None
    notes: Optional[str] = None


class ScheduleEntryResponse(BaseModel):
    id: UUID
    org_id: UUID
    season_id: Optional[UUID] = None
    entry_type: str
    team_id: Optional[UUID] = None
    opponent_team_id: Optional[UUID] = None
    field_id: Optional[UUID] = None
    start_time: datetime
    end_time: datetime
    title: Optional[str] = None
    description: Optional[str] = None
    status: str
    weather_status: str = "clear"
    referee_ids: list = []
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GenerateGamesRequest(BaseModel):
    team_ids: list[UUID] = []
    games_per_team: int = 8
    available_field_ids: Optional[list[UUID]] = []
    available_dates: Optional[list[date]] = []
    game_duration_minutes: int = 60
    constraints: dict = {}


class GeneratePracticesRequest(BaseModel):
    team_ids: list[UUID]
    field_ids: list[UUID] = []
    practices_per_week: int = 2
    duration_minutes: int = 90
    start_date: date
    end_date: date


# --- Module 6: AI Operations ---
class AIOpsAskRequest(BaseModel):
    question: str


class AIEmailDraftRequest(BaseModel):
    audience: str
    purpose: str
    context: Optional[str] = ""


class AISeasonPlanRequest(BaseModel):
    season_name: str
    age_groups: list[str] = []
    estimated_players: int = 100
    available_fields: int = 4
    weeks: int = 10


# --- Module 7: Communication Center ---
class MessageCreate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    body_html: Optional[str] = None
    channel: str = "email"
    audience_type: str = "all"
    audience_filter: Optional[dict] = None
    scheduled_for: Optional[datetime] = None


class MessageUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    body_html: Optional[str] = None
    audience_type: Optional[str] = None
    audience_filter: Optional[dict] = None
    scheduled_for: Optional[datetime] = None


class MessageResponse(BaseModel):
    id: UUID
    org_id: UUID
    subject: Optional[str] = None
    body: Optional[str] = None
    body_html: Optional[str] = None
    channel: str
    audience_type: str
    audience_filter: Optional[dict] = None
    status: str
    scheduled_for: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    recipient_count: int = 0
    open_count: int = 0
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AIDraftMessageRequest(BaseModel):
    audience: str
    purpose: str
    tone: str = "professional"
    context: Optional[str] = None


# --- Module 8: Coach Management ---
class CertificationUpdate(BaseModel):
    certifications: list[dict]  # [{name, expiry, status}]


class AvailabilityUpdate(BaseModel):
    availability: dict  # {mon: ["16:00-20:00"], ...}


class CoachAssignRequest(BaseModel):
    team_ids: list[UUID]


# --- Module 9: Attendance ---
class AttendanceSubmit(BaseModel):
    records: list[dict]  # [{player_id, status, notes?}]


class AttendanceResponse(BaseModel):
    id: UUID
    org_id: UUID
    schedule_entry_id: UUID
    player_id: UUID
    team_id: Optional[UUID] = None
    status: str
    check_in_time: Optional[datetime] = None
    recorded_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Module 11: Document Vault ---
class PlayerDocumentCreate(BaseModel):
    document_type: str = "other"
    file_name: Optional[str] = None
    file_data: str  # base64 encoded
    mime_type: Optional[str] = None
    uploaded_by: Optional[str] = None
    expires_at: Optional[datetime] = None


class PlayerDocumentResponse(BaseModel):
    id: UUID
    player_id: UUID
    org_id: UUID
    document_type: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    uploaded_by: Optional[str] = None
    expires_at: Optional[datetime] = None
    verified: bool = False
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Team Invites ---
class TeamInviteCreate(BaseModel):
    player_ids: list[UUID]
    message: Optional[str] = None
    expires_at: Optional[datetime] = None


class TeamInviteUpdate(BaseModel):
    status: str  # accepted/declined


class TeamInviteResponse(BaseModel):
    id: UUID
    team_id: UUID
    player_id: UUID
    status: str
    invited_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    message: Optional[str] = None

    model_config = {"from_attributes": True}


# --- Notifications ---
class NotificationCreate(BaseModel):
    type: str
    title: str
    message: Optional[str] = None
    recipients: list = []


class NotificationResponse(BaseModel):
    id: UUID
    org_id: UUID
    type: str
    title: str
    message: Optional[str] = None
    recipients: list = []
    status: str
    created_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Rec League Matchup Generator ---
class GenerateMatchupsRequest(BaseModel):
    program_id: Optional[UUID] = None
    team_ids: list[UUID] = []
    rounds: int = 1
    game_day: str = "saturday"
    start_time: str = "09:00"
    game_duration_minutes: int = 60
    field_ids: list[UUID] = []
