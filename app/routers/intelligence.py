"""
Intelligence & Benchmarking Router — Version 4.0
Club Health Score, IYSL Best Practice Assessment, Club Lifecycle,
Player Development, Registration Forecasting, Parent Engagement,
Financial Dashboard, Seasonal Reports, Competition, Compliance.
"""

import json
import logging
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, and_
from typing import Optional

from app.database import async_session
from app.models import (
    ClubHealthScore, BestPracticeAssessment, ClubLifecycleScore,
    PlayerDevelopmentPath, RegistrationForecast, ParentEngagement,
    SeasonReport, CompetitionResult, ComplianceItem,
    Player, Evaluator, Team, TeamRoster, Program, Season,
    AttendanceRecord, Message, MessageRecipient, Score,
    PlayerReport, EvaluationEvent, Organization,
    PlayerDocument,
)
from app.services.ai import call_openai

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Intelligence & Benchmarking"])


# ============================================================
# IYSL BENCHMARK DATA — hardcoded from the 2500-club study
# ============================================================

IYSL_DEPARTMENT_QUESTIONS = {
    "Leadership": ["Q1","Q9","Q13","Q15","Q27","Q35","Q43","Q44","Q48","Q54","Q55","Q56","Q57","Q58","Q59"],
    "Operations": ["Q4","Q14","Q30","Q31","Q32","Q36","Q41","Q47","Q49","Q53"],
    "Memberships": ["Q2","Q3","Q16","Q17","Q18","Q19","Q20","Q46","Q60"],
    "Programs": ["Q5","Q10","Q33","Q37","Q38","Q39","Q40"],
    "Human Resources": ["Q24","Q25","Q26","Q29","Q34","Q52"],
    "Education": ["Q6","Q7","Q8","Q11","Q21","Q22","Q23","Q28"],
    "Finance": ["Q12","Q42","Q45","Q50","Q51"],
}

IYSL_ROLE_QUESTIONS = {
    "Executive Director": ["Q1","Q27","Q35","Q43","Q44","Q48","Q53","Q54","Q55","Q56","Q57","Q58"],
    "Technical Director": ["Q5","Q6","Q7","Q8","Q10","Q11","Q21","Q22","Q23","Q28","Q37","Q38"],
    "Community Relationships": ["Q18","Q19","Q33"],
    "Program Manager": ["Q39","Q40"],
    "Volunteer Coordinator": ["Q3","Q46"],
    "Technology Manager": ["Q4","Q32"],
    "HR Director": ["Q24","Q25","Q26","Q29","Q34","Q52","Q59"],
    "Finance Director": ["Q12","Q42","Q45","Q49","Q50","Q51"],
    "Operations Director": ["Q14","Q30","Q31","Q36","Q41","Q47"],
    "Memberships Director": ["Q2","Q9","Q13","Q15","Q16","Q17","Q20","Q60"],
}

# All Clubs average scores by department (from IYSL 2500-club benchmark)
IYSL_ALL_CLUBS_AVG = {
    "Leadership": 52, "Operations": 48, "Memberships": 55,
    "Programs": 58, "Human Resources": 42, "Education": 45,
    "Finance": 50, "overall": 50,
}
IYSL_TOP_10_PCT = {
    "Leadership": 82, "Operations": 78, "Memberships": 85,
    "Programs": 88, "Human Resources": 75, "Education": 80,
    "Finance": 82, "overall": 81,
}

# All Clubs average by role
IYSL_ALL_CLUBS_ROLE_AVG = {
    "Executive Director": 53, "Technical Director": 50, "Community Relationships": 55,
    "Program Manager": 58, "Volunteer Coordinator": 45, "Technology Manager": 42,
    "HR Director": 40, "Finance Director": 48, "Operations Director": 47,
    "Memberships Director": 54,
}
IYSL_TOP_10_ROLE_AVG = {
    "Executive Director": 84, "Technical Director": 82, "Community Relationships": 86,
    "Program Manager": 89, "Volunteer Coordinator": 78, "Technology Manager": 76,
    "HR Director": 74, "Finance Director": 80, "Operations Director": 77,
    "Memberships Director": 83,
}

IYSL_STATEMENTS = {
    "Q1": "Our organization has a clearly articulated mission and vision statement that is known and supported by all stakeholders.",
    "Q2": "We actively track and measure our total membership numbers, including new registrations, renewals, and attrition rates each season.",
    "Q3": "Our club has a structured volunteer recruitment and retention program with defined roles and recognition.",
    "Q4": "We use technology effectively for registration, communication, scheduling, and data management across all programs.",
    "Q5": "Our club offers a comprehensive player development curriculum that is age-appropriate and aligned with best practices.",
    "Q6": "All coaches in our organization hold a minimum coaching license/certification appropriate for their level.",
    "Q7": "We provide ongoing continuing education opportunities and in-service training for all coaching staff.",
    "Q8": "Our club has a formal coach mentoring program pairing experienced coaches with newer staff members.",
    "Q9": "Our leadership team regularly communicates organizational goals, updates, and decisions to all members transparently.",
    "Q10": "We have a documented player development pathway that clearly defines progression from recreational to competitive levels.",
    "Q11": "Our club requires and tracks completion of SafeSport, concussion protocol, and first aid training for all staff.",
    "Q12": "Our organization maintains a detailed annual budget with revenue projections, expense tracking, and financial reporting to the board.",
    "Q13": "We conduct regular surveys and feedback sessions with parents, players, and coaches to assess satisfaction and identify improvements.",
    "Q14": "Our organization has documented standard operating procedures for day-to-day operations including registration, scheduling, and communications.",
    "Q15": "Our board of directors includes diverse representation and meets regularly with documented minutes and action items.",
    "Q16": "We actively promote inclusion and accessibility, ensuring programs are available to players of all abilities and backgrounds.",
    "Q17": "Our club offers financial aid, scholarships, or sliding-scale fees to ensure cost is not a barrier to participation.",
    "Q18": "We maintain strong relationships with local schools, parks departments, and community organizations for mutual benefit.",
    "Q19": "Our organization actively engages with the broader soccer community through leagues, tournaments, and inter-club partnerships.",
    "Q20": "We have a formal onboarding process for new families that includes orientation, handbook distribution, and introduction to club culture.",
    "Q21": "Our club provides age-appropriate training environments with proper equipment, field sizes, and goal dimensions.",
    "Q22": "We implement a play-based development approach for our youngest age groups (U6-U8) that prioritizes fun and skill discovery.",
    "Q23": "Our coaching staff uses video analysis, technology tools, or data-driven methods to support player development.",
    "Q24": "We have clearly defined job descriptions and performance expectations for all paid and volunteer positions.",
    "Q25": "Our organization conducts background checks on all adults who interact with players in an official capacity.",
    "Q26": "We have a formal grievance and conflict resolution process that is communicated to all stakeholders.",
    "Q27": "Our leadership team has a documented succession plan to ensure continuity in key positions.",
    "Q28": "Our club supports coach development by funding external courses, workshops, and coaching license advancement.",
    "Q29": "We maintain a current roster of all staff, volunteers, and their certifications with automated expiry reminders.",
    "Q30": "Our organization has a comprehensive risk management plan including insurance, waivers, and emergency action procedures.",
    "Q31": "We have a weather policy and emergency communication system that can reach all stakeholders within minutes.",
    "Q32": "Our website and digital presence are current, professional, and serve as an effective resource for members and prospects.",
    "Q33": "We host community events, open houses, or free clinics to engage the broader community and attract new members.",
    "Q34": "Our organization provides equal opportunities and support for both male and female programs at all levels.",
    "Q35": "Our board engages in annual strategic planning with measurable goals and regular progress reviews.",
    "Q36": "We have established relationships with facility owners and secure multi-year agreements for field and facility access.",
    "Q37": "Our competitive programs are structured to provide appropriate levels of challenge while retaining player participation.",
    "Q38": "We offer specialized programming (goalkeeping, position-specific training, futsal) to complement team training.",
    "Q39": "Our recreational programs emphasize skill development, enjoyment, and equal playing time for all participants.",
    "Q40": "We evaluate and adjust program offerings annually based on enrollment data, feedback, and community needs.",
    "Q41": "Our organization maintains adequate facility access including practice fields, game fields, and indoor options for year-round play.",
    "Q42": "We diversify revenue through multiple streams including registration fees, sponsorships, fundraising, grants, and merchandise.",
    "Q43": "Our executive leadership has defined roles with clear delineation between governance (board) and management (staff).",
    "Q44": "We benchmark our organization's performance against peer clubs and national standards to identify areas for improvement.",
    "Q45": "Our financial controls include segregation of duties, regular audits, and transparent reporting to membership.",
    "Q46": "We have an active parent volunteer program with defined committees, roles, and opportunities for involvement.",
    "Q47": "Our scheduling process accounts for field availability, travel distances, age-appropriate game times, and rest periods.",
    "Q48": "Our organization has a crisis communication plan for handling sensitive situations involving players, staff, or the club's reputation.",
    "Q49": "We maintain organized digital and physical records with appropriate retention policies and data privacy protections.",
    "Q50": "Our organization has adequate cash reserves (3-6 months operating expenses) to manage seasonal revenue fluctuations.",
    "Q51": "We provide regular financial updates to membership and publish an annual financial summary or report.",
    "Q52": "Our organization has a formal onboarding and orientation process for new coaches and staff members.",
    "Q53": "We regularly review and update organizational policies, bylaws, and procedures to reflect current best practices.",
    "Q54": "Our leadership actively fosters a positive organizational culture that values respect, sportsmanship, and player well-being.",
    "Q55": "We have established partnerships with higher-level clubs, academies, or college programs to support elite player pathways.",
    "Q56": "Our organization uses data and metrics to inform decision-making across programming, staffing, and resource allocation.",
    "Q57": "We have a formal marketing and communication strategy to promote programs, share achievements, and build brand awareness.",
    "Q58": "Our leadership team includes individuals with professional expertise in areas such as finance, law, marketing, and education.",
    "Q59": "We provide competitive compensation and professional development opportunities to attract and retain quality staff.",
    "Q60": "Our club has a member retention strategy that includes exit surveys, re-engagement campaigns, and loyalty programs.",
}

DEVELOPMENT_LEVELS = ["Tots", "Rec", "Pre-Travel", "Select", "Travel", "Academy"]

# ============================================================
# DMV LEAGUE REFERENCE DATA
# ============================================================

DMV_LEAGUES = {
    "MLS_NEXT": {
        "name": "MLS NEXT Academy Division",
        "region": "Virginia",
        "level": "Elite",
        "age_groups": ["U13","U14","U15","U16","U17","U18","U19"],
        "season": "September-June (10 months)",
        "competitors": ["Loudoun Soccer","Alexandria SA","McLean Youth Soccer","FC Richmond","Springfield/SYC","The St. James","Virginia Revolution SC","Virginia Rush"],
        "url": "https://www.mlssoccer.com/mlsnext"
    },
    "GA_ASPIRE": {
        "name": "Girls Academy ASPIRE",
        "region": "East",
        "level": "Elite",
        "age_groups": ["U13","U14","U15","U16","U17","U18","U19"],
        "season": "September-June",
        "competitors": [],
        "url": "https://girlsacademy.com"
    },
    "NCSL": {
        "name": "National Capital Soccer League",
        "region": "DMV",
        "level": "Competitive",
        "age_groups": ["U8","U9","U10","U11","U12","U13","U14","U15","U16","U17","U18","U19"],
        "member_clubs": 72,
        "season": "Fall + Spring",
        "url": "https://www.ncsoccer.org"
    },
    "CPSL": {
        "name": "Chesapeake Premier Soccer League",
        "region": "DMV",
        "level": "Competitive",
        "age_groups": ["U8","U9","U10","U11","U12","U13","U14","U15","U16","U17","U18","U19"],
        "season": "Fall + Spring"
    },
    "EDP": {
        "name": "Elite Development Program",
        "region": "Mid-Atlantic",
        "level": "Competitive",
        "age_groups": ["U8","U9","U10","U11","U12","U13","U14","U15","U16","U17","U18","U19"],
        "url": "https://www.edpsoccer.com"
    },
    "MDSL": {
        "name": "Maryland Developmental Soccer League",
        "region": "Maryland",
        "level": "Developmental",
        "age_groups": ["U8","U9","U10","U11","U12","U13","U14"],
        "season": "Fall + Spring"
    },
}


# ============================================================
# Pydantic Schemas
# ============================================================

class HealthScoreOut(BaseModel):
    id: str
    score: float
    breakdown: dict
    benchmarks: dict
    ai_narrative: Optional[str]
    generated_at: str

class AssessmentIn(BaseModel):
    respondent_name: str
    respondent_role: str  # leader/staff/coach/customer
    responses: dict  # {Q1: 60, Q2: 80, ... Q60: 40}

class MatchResultIn(BaseModel):
    team_id: str
    opponent_name: str
    league: Optional[str] = None
    match_date: str  # YYYY-MM-DD
    result: str  # win/loss/draw
    score_for: int = 0
    score_against: int = 0
    goal_scorers: list = []
    assists: list = []
    notes: Optional[str] = None

class DevelopmentPathIn(BaseModel):
    current_level: str
    path_entries: list  # [{season, level, date, notes}]
    predicted_next_level: Optional[str] = None

class ComplianceItemIn(BaseModel):
    item_type: str
    person_name: str
    person_role: str
    status: str = "missing"
    expiry_date: Optional[str] = None
    document_id: Optional[str] = None
    notes: Optional[str] = None

class ReportGenerateIn(BaseModel):
    report_type: str  # monthly/seasonal/annual
    season: str  # "Spring 2026"


# ============================================================
# CLUB HEALTH SCORE
# ============================================================

@router.post("/api/organizations/{org_id}/health-score/generate")
async def generate_health_score(org_id: str):
    async with async_session() as session:
        # Gather data for all 7 factors
        total_players = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.active == True)
            )
        )).scalar() or 0

        total_coaches = (await session.execute(
            select(func.count()).select_from(Evaluator).where(
                and_(Evaluator.organization_id == org_id, Evaluator.active == True)
            )
        )).scalar() or 0

        total_teams = (await session.execute(
            select(func.count()).select_from(Team).where(Team.org_id == org_id)
        )).scalar() or 0

        # 1. Retention rate — % of players active vs total ever
        all_players = (await session.execute(
            select(func.count()).select_from(Player).where(Player.organization_id == org_id)
        )).scalar() or 1
        retention_rate = min(100, (total_players / max(all_players, 1)) * 100)

        # 2. Coach ratio — 1:10 is ideal (score 100)
        if total_players > 0 and total_coaches > 0:
            ratio = total_players / total_coaches
            coach_ratio_score = max(0, min(100, 100 - abs(ratio - 10) * 10))
        else:
            coach_ratio_score = 0

        # 3. Financial aid — % of programs with financial aid
        aid_programs = (await session.execute(
            select(func.count()).select_from(Program).where(
                and_(Program.org_id == org_id, Program.financial_aid_eligible == True)
            )
        )).scalar() or 0
        total_programs = (await session.execute(
            select(func.count()).select_from(Program).where(Program.org_id == org_id)
        )).scalar() or 1
        financial_aid_pct = min(100, (aid_programs / max(total_programs, 1)) * 100)

        # 4. Gender equity — target 50% female
        # Use metadata or age_group patterns; approximate with position distribution
        female_count = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.active == True)
            )
        )).scalar() or 0
        # Without explicit gender data, approximate from programs
        girls_programs = (await session.execute(
            select(func.count()).select_from(Program).where(
                and_(Program.org_id == org_id, Program.gender == "girls")
            )
        )).scalar() or 0
        coed_programs = (await session.execute(
            select(func.count()).select_from(Program).where(
                and_(Program.org_id == org_id, Program.gender == "coed")
            )
        )).scalar() or 0
        if total_programs > 0:
            female_pct = ((girls_programs + coed_programs * 0.5) / total_programs) * 100
            gender_equity = max(0, 100 - abs(50 - female_pct) * 2)
        else:
            gender_equity = 50

        # 5. Fill rates — roster size vs max_roster_size
        teams_data = (await session.execute(
            select(Team).where(Team.org_id == org_id)
        )).scalars().all()
        if teams_data:
            fill_scores = []
            for t in teams_data:
                roster_count = (await session.execute(
                    select(func.count()).select_from(TeamRoster).where(TeamRoster.team_id == t.id)
                )).scalar() or 0
                cap = t.max_roster_size or 15
                fill_scores.append(min(100, (roster_count / cap) * 100))
            fill_rate = sum(fill_scores) / len(fill_scores)
        else:
            fill_rate = 0

        # 6. Development progression — % of players with evaluation improvement
        reports_count = (await session.execute(
            select(func.count()).select_from(PlayerReport).where(PlayerReport.organization_id == org_id)
        )).scalar() or 0
        dev_progression = min(100, (reports_count / max(total_players, 1)) * 50 + 25) if total_players > 0 else 0

        # 7. Parent satisfaction — from evaluations sent
        sent_reports = (await session.execute(
            select(func.count()).select_from(PlayerReport).where(
                and_(PlayerReport.organization_id == org_id, PlayerReport.sent_to_parent == True)
            )
        )).scalar() or 0
        parent_satisfaction = min(100, (sent_reports / max(reports_count, 1)) * 100) if reports_count > 0 else 50

        # Weighted average
        weights = {
            "retention_rate": 20, "coach_ratio": 15, "financial_aid_pct": 10,
            "gender_equity": 15, "fill_rate": 15, "development_progression": 15,
            "parent_satisfaction": 10,
        }
        factor_scores = {
            "retention_rate": round(retention_rate, 1),
            "coach_ratio": round(coach_ratio_score, 1),
            "financial_aid_pct": round(financial_aid_pct, 1),
            "gender_equity": round(gender_equity, 1),
            "fill_rate": round(fill_rate, 1),
            "development_progression": round(dev_progression, 1),
            "parent_satisfaction": round(parent_satisfaction, 1),
        }
        overall = sum(factor_scores[k] * weights[k] for k in weights) / sum(weights.values())

        benchmarks = {
            "all_clubs_avg": IYSL_ALL_CLUBS_AVG,
            "top_10_pct": IYSL_TOP_10_PCT,
        }

        # AI narrative
        try:
            ai_prompt = f"""You are a youth sports club consultant. Analyze this club health score and provide specific, actionable insights.

Club Health Score: {overall:.1f}/100
Factor Breakdown:
- Retention Rate: {factor_scores['retention_rate']}/100 (weight 20%) — All Clubs avg: 50, Top 10%: 81
- Coach-to-Player Ratio: {factor_scores['coach_ratio']}/100 (weight 15%) — {total_coaches} coaches for {total_players} players
- Financial Aid: {factor_scores['financial_aid_pct']}/100 (weight 10%) — {aid_programs} of {total_programs} programs offer aid
- Gender Equity: {factor_scores['gender_equity']}/100 (weight 15%)
- Program Fill Rate: {factor_scores['fill_rate']}/100 (weight 15%) — {total_teams} teams
- Development Progression: {factor_scores['development_progression']}/100 (weight 15%)
- Parent Satisfaction: {factor_scores['parent_satisfaction']}/100 (weight 10%)

Write 3-4 sentences: what's strong, what needs attention, and one specific recommendation. Be concrete, not generic."""
            ai_narrative = await call_openai([{"role": "user", "content": ai_prompt}], max_tokens=500)
        except Exception:
            ai_narrative = f"Your club scored {overall:.1f}/100 overall. Focus on improving your lowest-scoring areas to move toward the Top 10% benchmark of 81."

        health = ClubHealthScore(
            id=uuid.uuid4(), org_id=org_id, score=round(overall, 1),
            breakdown=factor_scores, benchmarks=benchmarks,
            ai_narrative=ai_narrative,
        )
        session.add(health)
        await session.commit()

        return {
            "id": str(health.id), "score": health.score,
            "breakdown": health.breakdown, "benchmarks": health.benchmarks,
            "ai_narrative": health.ai_narrative,
            "generated_at": health.generated_at.isoformat() if health.generated_at else datetime.utcnow().isoformat(),
            "stats": {"total_players": total_players, "total_coaches": total_coaches, "total_teams": total_teams},
        }


@router.get("/api/organizations/{org_id}/health-score")
async def get_health_score(org_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(ClubHealthScore).where(ClubHealthScore.org_id == org_id)
            .order_by(ClubHealthScore.generated_at.desc()).limit(1)
        )
        hs = result.scalars().first()
        if not hs:
            raise HTTPException(404, "No health score generated yet. Use POST to generate.")
        return {
            "id": str(hs.id), "score": hs.score,
            "breakdown": hs.breakdown, "benchmarks": hs.benchmarks,
            "ai_narrative": hs.ai_narrative,
            "generated_at": hs.generated_at.isoformat(),
        }


@router.get("/api/organizations/{org_id}/health-score/history")
async def health_score_history(org_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(ClubHealthScore).where(ClubHealthScore.org_id == org_id)
            .order_by(ClubHealthScore.generated_at.desc()).limit(50)
        )
        scores = result.scalars().all()
        return [{"id": str(s.id), "score": s.score, "generated_at": s.generated_at.isoformat()} for s in scores]


# ============================================================
# IYSL BEST PRACTICE ASSESSMENT
# ============================================================

@router.post("/api/organizations/{org_id}/assessments")
async def submit_assessment(org_id: str, data: AssessmentIn):
    async with async_session() as session:
        assessment = BestPracticeAssessment(
            id=uuid.uuid4(), org_id=org_id,
            respondent_name=data.respondent_name,
            respondent_role=data.respondent_role,
            responses=data.responses,
        )
        session.add(assessment)
        await session.commit()
        return {"id": str(assessment.id), "message": "Assessment submitted successfully"}


@router.get("/api/organizations/{org_id}/assessments")
async def list_assessments(org_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(BestPracticeAssessment).where(BestPracticeAssessment.org_id == org_id)
            .order_by(BestPracticeAssessment.completed_at.desc())
        )
        assessments = result.scalars().all()
        return [
            {"id": str(a.id), "respondent_name": a.respondent_name, "respondent_role": a.respondent_role,
             "completed_at": a.completed_at.isoformat() if a.completed_at else None}
            for a in assessments
        ]


@router.get("/api/organizations/{org_id}/assessments/report")
async def assessment_report(org_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(BestPracticeAssessment).where(BestPracticeAssessment.org_id == org_id)
        )
        assessments = result.scalars().all()
        if not assessments:
            raise HTTPException(404, "No assessments found. Submit at least one assessment first.")

        # Aggregate all responses
        all_responses = {}
        role_responses = {}  # by respondent_role
        for a in assessments:
            for q, v in (a.responses or {}).items():
                all_responses.setdefault(q, []).append(v)
            role_responses.setdefault(a.respondent_role, {})
            for q, v in (a.responses or {}).items():
                role_responses[a.respondent_role].setdefault(q, []).append(v)

        avg_responses = {q: sum(vals)/len(vals) for q, vals in all_responses.items()}

        # Department scores
        dept_scores = {}
        for dept, questions in IYSL_DEPARTMENT_QUESTIONS.items():
            vals = [avg_responses.get(q, 0) for q in questions if q in avg_responses]
            dept_scores[dept] = round(sum(vals)/len(vals), 1) if vals else 0

        overall_score = round(sum(dept_scores.values()) / len(dept_scores), 1) if dept_scores else 0

        # Role scores
        role_scores = {}
        for role, questions in IYSL_ROLE_QUESTIONS.items():
            vals = [avg_responses.get(q, 0) for q in questions if q in avg_responses]
            role_scores[role] = round(sum(vals)/len(vals), 1) if vals else 0

        # Gap analysis (distance to Model Club 100%)
        gap_analysis = {}
        for dept, score in dept_scores.items():
            gap_analysis[dept] = {
                "current": score,
                "model_club": 100,
                "gap": round(100 - score, 1),
                "all_clubs_avg": IYSL_ALL_CLUBS_AVG.get(dept, 50),
                "top_10_pct": IYSL_TOP_10_PCT.get(dept, 80),
                "vs_all_clubs": round(score - IYSL_ALL_CLUBS_AVG.get(dept, 50), 1),
                "vs_top_10": round(score - IYSL_TOP_10_PCT.get(dept, 80), 1),
            }

        # Stakeholder perception
        stakeholder_scores = {}
        for role_name, qs in role_responses.items():
            avg_by_role = {q: sum(v)/len(v) for q, v in qs.items()}
            stakeholder_scores[role_name] = round(
                sum(avg_by_role.values()) / len(avg_by_role), 1
            ) if avg_by_role else 0

        # AI recommendations
        try:
            ai_prompt = f"""You are an IYSL youth soccer club consultant analyzing a Best Practice Assessment.

Overall Score: {overall_score}/100
Department Scores: {json.dumps(dept_scores)}
Gap to All Clubs Average: {json.dumps({d: gap_analysis[d]['vs_all_clubs'] for d in gap_analysis})}
Gap to Top 10%: {json.dumps({d: gap_analysis[d]['vs_top_10'] for d in gap_analysis})}
Role Scores: {json.dumps(role_scores)}
Stakeholder Perceptions: {json.dumps(stakeholder_scores)}
Number of respondents: {len(assessments)}

Provide 5 specific, prioritized improvement recommendations. For each, name the department, the gap, and a concrete action step. Be specific to youth soccer club operations."""
            ai_recommendations = await call_openai([{"role": "user", "content": ai_prompt}], max_tokens=800)
        except Exception:
            ai_recommendations = "Complete more assessments to generate AI-powered recommendations."

        return {
            "overall_score": overall_score,
            "respondent_count": len(assessments),
            "department_scores": dept_scores,
            "role_scores": role_scores,
            "gap_analysis": gap_analysis,
            "stakeholder_perceptions": stakeholder_scores,
            "benchmarks": {
                "all_clubs_avg": IYSL_ALL_CLUBS_AVG,
                "top_10_pct": IYSL_TOP_10_PCT,
                "all_clubs_role_avg": IYSL_ALL_CLUBS_ROLE_AVG,
                "top_10_role_avg": IYSL_TOP_10_ROLE_AVG,
            },
            "ai_recommendations": ai_recommendations,
        }


# ============================================================
# CLUB LIFECYCLE PREDICTOR
# ============================================================

@router.get("/api/organizations/{org_id}/lifecycle")
async def get_lifecycle(org_id: str):
    async with async_session() as session:
        # Check for existing
        existing = (await session.execute(
            select(ClubLifecycleScore).where(ClubLifecycleScore.org_id == org_id)
            .order_by(ClubLifecycleScore.generated_at.desc()).limit(1)
        )).scalars().first()
        if existing:
            return {
                "id": str(existing.id), "overall_phase": existing.overall_phase,
                "factor_scores": existing.factor_scores,
                "ai_analysis": existing.ai_analysis,
                "generated_at": existing.generated_at.isoformat(),
            }

        # Calculate from data
        total_players = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.active == True)
            )
        )).scalar() or 0
        total_coaches = (await session.execute(
            select(func.count()).select_from(Evaluator).where(
                and_(Evaluator.organization_id == org_id, Evaluator.active == True)
            )
        )).scalar() or 0
        total_teams = (await session.execute(
            select(func.count()).select_from(Team).where(Team.org_id == org_id)
        )).scalar() or 0
        total_programs = (await session.execute(
            select(func.count()).select_from(Program).where(Program.org_id == org_id)
        )).scalar() or 0
        total_seasons = (await session.execute(
            select(func.count()).select_from(Season).where(Season.org_id == org_id)
        )).scalar() or 0

        def phase_from_count(count, thresholds):
            for i, t in enumerate(thresholds):
                if count < t:
                    return i + 1
            return 5

        factors = {
            "membership_size": {"phase": phase_from_count(total_players, [20, 50, 150, 400]), "value": total_players},
            "coaching_staff": {"phase": phase_from_count(total_coaches, [2, 5, 15, 30]), "value": total_coaches},
            "program_variety": {"phase": phase_from_count(total_programs, [2, 4, 8, 15]), "value": total_programs},
            "team_count": {"phase": phase_from_count(total_teams, [3, 8, 20, 50]), "value": total_teams},
            "season_history": {"phase": phase_from_count(total_seasons, [1, 3, 6, 12]), "value": total_seasons},
            "technology_adoption": {"phase": 3, "value": "Using TBM platform"},
            "financial_structure": {"phase": phase_from_count(total_programs, [1, 3, 6, 10]), "value": total_programs},
            "community_engagement": {"phase": phase_from_count(total_players, [10, 30, 100, 250]), "value": total_players},
            "volunteer_base": {"phase": phase_from_count(total_coaches, [1, 3, 10, 20]), "value": total_coaches},
            "governance": {"phase": min(5, max(1, total_seasons)), "value": total_seasons},
        }
        phases = [f["phase"] for f in factors.values()]
        overall_phase = round(sum(phases) / len(phases))
        overall_phase = max(1, min(5, overall_phase))

        phase_names = {1: "Startup", 2: "Growth", 3: "Established", 4: "Mature", 5: "Model Club"}
        try:
            ai_analysis = await call_openai([{"role": "user", "content": f"""Analyze this youth soccer club's lifecycle phase.

Overall Phase: {overall_phase}/5 ({phase_names[overall_phase]})
Factor Details: {json.dumps(factors, default=str)}

Provide 2-3 sentences on where the club stands and what milestones to target next to advance to the next phase."""}], max_tokens=400)
        except Exception:
            ai_analysis = f"Your club is in Phase {overall_phase} ({phase_names[overall_phase]}). Continue growing your programs and membership to advance."

        lifecycle = ClubLifecycleScore(
            id=uuid.uuid4(), org_id=org_id, overall_phase=overall_phase,
            factor_scores=factors, ai_analysis=ai_analysis,
        )
        session.add(lifecycle)
        await session.commit()

        return {
            "id": str(lifecycle.id), "overall_phase": overall_phase,
            "phase_name": phase_names[overall_phase],
            "factor_scores": factors, "ai_analysis": ai_analysis,
            "generated_at": lifecycle.generated_at.isoformat() if lifecycle.generated_at else datetime.utcnow().isoformat(),
        }


# ============================================================
# PLAYER DEVELOPMENT PATHWAYS
# ============================================================

@router.get("/api/players/{player_id}/development-path")
async def get_player_development_path(player_id: str):
    async with async_session() as session:
        path = (await session.execute(
            select(PlayerDevelopmentPath).where(PlayerDevelopmentPath.player_id == player_id)
        )).scalars().first()

        player = (await session.execute(select(Player).where(Player.id == player_id))).scalars().first()
        if not player:
            raise HTTPException(404, "Player not found")

        # Build path from evaluation history
        reports = (await session.execute(
            select(PlayerReport).where(PlayerReport.player_id == player_id)
            .order_by(PlayerReport.created_at.asc())
        )).scalars().all()

        roster_entries = (await session.execute(
            select(TeamRoster, Team).join(Team, TeamRoster.team_id == Team.id)
            .where(TeamRoster.player_id == player_id)
        )).all()

        path_entries = []
        for r in reports:
            path_entries.append({
                "type": "evaluation", "date": r.created_at.isoformat() if r.created_at else None,
                "overall_score": r.overall_score, "event_id": str(r.event_id),
            })
        for tr, team in roster_entries:
            path_entries.append({
                "type": "team", "date": tr.joined_at.isoformat() if tr.joined_at else None,
                "team_name": team.name, "level": team.team_level or "Rec",
            })

        # Determine current level from latest team
        current_level = "Rec"
        if roster_entries:
            latest_team = max(roster_entries, key=lambda x: x[0].joined_at or datetime.min)
            current_level = latest_team[1].team_level or "Rec"

        # Map to development levels
        level_idx = next((i for i, l in enumerate(DEVELOPMENT_LEVELS) if l.lower() in current_level.lower()), 1)
        predicted_next = DEVELOPMENT_LEVELS[min(level_idx + 1, len(DEVELOPMENT_LEVELS) - 1)]

        ai_prediction = None
        if path_entries:
            try:
                ai_prediction = await call_openai([{"role": "user", "content": f"""Analyze this youth soccer player's development path and predict their trajectory.

Player: {player.first_name} {player.last_name}, Age Group: {player.age_group}
Current Level: {current_level}
History: {json.dumps(path_entries[-10:], default=str)}

In 2-3 sentences: assess their progression and predict readiness for the next level ({predicted_next})."""}], max_tokens=300)
            except Exception:
                ai_prediction = f"{player.first_name} is currently at {current_level} level. Continue development for advancement to {predicted_next}."

        # Upsert path
        if path:
            path.path_entries = path_entries
            path.current_level = current_level
            path.predicted_next_level = predicted_next
            path.ai_prediction = ai_prediction
        else:
            path = PlayerDevelopmentPath(
                id=uuid.uuid4(), player_id=player_id, org_id=str(player.organization_id),
                path_entries=path_entries, current_level=current_level,
                predicted_next_level=predicted_next, ai_prediction=ai_prediction,
            )
            session.add(path)
        await session.commit()

        return {
            "player_id": str(player_id),
            "player_name": f"{player.first_name} {player.last_name}",
            "current_level": current_level,
            "predicted_next_level": predicted_next,
            "path_entries": path_entries,
            "ai_prediction": ai_prediction,
            "development_levels": DEVELOPMENT_LEVELS,
        }


@router.get("/api/organizations/{org_id}/development-paths/summary")
async def development_summary(org_id: str):
    async with async_session() as session:
        paths = (await session.execute(
            select(PlayerDevelopmentPath).where(PlayerDevelopmentPath.org_id == org_id)
        )).scalars().all()

        level_counts = {level: 0 for level in DEVELOPMENT_LEVELS}
        for p in paths:
            cl = p.current_level or "Rec"
            for level in DEVELOPMENT_LEVELS:
                if level.lower() in cl.lower():
                    level_counts[level] += 1
                    break
            else:
                level_counts["Rec"] += 1

        return {
            "total_tracked": len(paths),
            "by_level": level_counts,
            "development_levels": DEVELOPMENT_LEVELS,
        }


@router.post("/api/organizations/{org_id}/development-paths/ai-predict")
async def ai_predict_all(org_id: str):
    async with async_session() as session:
        players = (await session.execute(
            select(Player).where(and_(Player.organization_id == org_id, Player.active == True))
        )).scalars().all()

        results = []
        for player in players[:50]:  # Limit to 50 for performance
            # Get latest team info
            roster_entry = (await session.execute(
                select(TeamRoster, Team).join(Team, TeamRoster.team_id == Team.id)
                .where(TeamRoster.player_id == player.id)
                .order_by(TeamRoster.joined_at.desc()).limit(1)
            )).first()

            current_level = roster_entry[1].team_level if roster_entry else "Rec"
            level_idx = next((i for i, l in enumerate(DEVELOPMENT_LEVELS) if l.lower() in (current_level or "rec").lower()), 1)
            predicted_next = DEVELOPMENT_LEVELS[min(level_idx + 1, len(DEVELOPMENT_LEVELS) - 1)]

            # Get eval scores
            latest_report = (await session.execute(
                select(PlayerReport).where(PlayerReport.player_id == player.id)
                .order_by(PlayerReport.created_at.desc()).limit(1)
            )).scalars().first()

            score = latest_report.overall_score if latest_report else None
            likelihood = "likely" if score and score > 3.5 else "developing" if score and score > 2.5 else "needs_support"

            results.append({
                "player_id": str(player.id),
                "player_name": f"{player.first_name} {player.last_name}",
                "age_group": player.age_group,
                "current_level": current_level or "Rec",
                "predicted_next_level": predicted_next,
                "latest_score": score,
                "advancement_likelihood": likelihood,
            })

        return {"predictions": results, "total": len(results)}


@router.post("/api/players/{player_id}/development-path")
async def create_player_development_path(player_id: str, data: DevelopmentPathIn):
    """Create or update a player's development path with explicit entries."""
    async with async_session() as session:
        player = (await session.execute(select(Player).where(Player.id == player_id))).scalars().first()
        if not player:
            raise HTTPException(404, "Player not found")

        predicted = data.predicted_next_level
        if not predicted:
            level_idx = next((i for i, l in enumerate(DEVELOPMENT_LEVELS) if l.lower() == data.current_level.lower()), 1)
            predicted = DEVELOPMENT_LEVELS[min(level_idx + 1, len(DEVELOPMENT_LEVELS) - 1)]

        existing = (await session.execute(
            select(PlayerDevelopmentPath).where(PlayerDevelopmentPath.player_id == player_id)
        )).scalars().first()

        if existing:
            existing.path_entries = data.path_entries
            existing.current_level = data.current_level
            existing.predicted_next_level = predicted
        else:
            path = PlayerDevelopmentPath(
                id=uuid.uuid4(), player_id=player_id, org_id=str(player.organization_id),
                path_entries=data.path_entries, current_level=data.current_level,
                predicted_next_level=predicted,
            )
            session.add(path)
        await session.commit()
        return {"player_id": player_id, "current_level": data.current_level, "message": "Development path saved"}


# ============================================================
# COMPETITION — LEAGUE REFERENCE DATA
# ============================================================

@router.get("/api/organizations/{org_id}/competition/leagues")
async def get_leagues(org_id: str):
    """Return all DMV league reference data."""
    return {
        "leagues": DMV_LEAGUES,
        "total": len(DMV_LEAGUES),
    }


@router.get("/api/organizations/{org_id}/competition/results")
async def get_competition_results(org_id: str, league: Optional[str] = None, team_id: Optional[str] = None):
    """Return recent match results, optionally filtered by league or team."""
    async with async_session() as session:
        q = select(CompetitionResult).where(CompetitionResult.org_id == org_id)
        if league:
            q = q.where(CompetitionResult.league == league)
        if team_id:
            q = q.where(CompetitionResult.team_id == team_id)
        q = q.order_by(CompetitionResult.match_date.desc()).limit(50)
        results = (await session.execute(q)).scalars().all()

        items = []
        for r in results:
            team = (await session.execute(select(Team).where(Team.id == r.team_id))).scalars().first()
            items.append({
                "id": str(r.id), "team_id": str(r.team_id),
                "team_name": team.name if team else "Unknown",
                "opponent_name": r.opponent_name, "league": r.league,
                "match_date": r.match_date.isoformat() if r.match_date else None,
                "result": r.result, "score_for": r.score_for,
                "score_against": r.score_against,
                "goal_scorers": r.goal_scorers or [],
                "assists": r.assists or [],
                "notes": r.notes,
            })
        return items


# ============================================================
# REGISTRATION FORECASTING
# ============================================================

@router.post("/api/organizations/{org_id}/forecasts/registration")
async def generate_registration_forecast(org_id: str):
    async with async_session() as session:
        # Get program data
        programs = (await session.execute(
            select(Program).where(Program.org_id == org_id)
        )).scalars().all()

        # Get player counts per program (via team rosters)
        forecast_data = {}
        for prog in programs:
            teams = (await session.execute(
                select(Team).where(Team.program_id == prog.id)
            )).scalars().all()
            total_rostered = 0
            for t in teams:
                count = (await session.execute(
                    select(func.count()).select_from(TeamRoster).where(TeamRoster.team_id == t.id)
                )).scalar() or 0
                total_rostered += count

            capacity = (prog.max_teams or 5) * (prog.max_players_per_team or 15)
            trend = "stable"
            if total_rostered > capacity * 0.8:
                trend = "growing"
            elif total_rostered < capacity * 0.3:
                trend = "declining"

            predicted = int(total_rostered * 1.1) if trend == "growing" else int(total_rostered * 0.95) if trend == "declining" else total_rostered
            confidence = 0.7 if total_rostered > 10 else 0.4

            forecast_data[prog.name] = {
                "current_count": total_rostered,
                "predicted_count": predicted,
                "capacity": capacity,
                "fill_rate": round(total_rostered / max(capacity, 1) * 100, 1),
                "confidence": confidence,
                "trend": trend,
            }

        try:
            ai_narrative = await call_openai([{"role": "user", "content": f"""Analyze registration forecast data for a youth soccer club and provide insights.

Program Forecasts: {json.dumps(forecast_data)}
Total Programs: {len(programs)}

Provide 3-4 sentences: overall registration outlook, which programs need attention, and marketing recommendations."""}], max_tokens=400)
        except Exception:
            ai_narrative = "Registration forecast generated. Review program-level details for specific trends."

        forecast = RegistrationForecast(
            id=uuid.uuid4(), org_id=org_id,
            season=f"Forecast {datetime.utcnow().strftime('%B %Y')}",
            forecast_data=forecast_data, ai_narrative=ai_narrative,
        )
        session.add(forecast)
        await session.commit()

        return {
            "id": str(forecast.id), "season": forecast.season,
            "forecast_data": forecast_data, "ai_narrative": ai_narrative,
            "generated_at": forecast.generated_at.isoformat() if forecast.generated_at else datetime.utcnow().isoformat(),
        }


@router.get("/api/organizations/{org_id}/forecasts")
async def list_forecasts(org_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(RegistrationForecast).where(RegistrationForecast.org_id == org_id)
            .order_by(RegistrationForecast.generated_at.desc()).limit(20)
        )
        forecasts = result.scalars().all()
        return [
            {"id": str(f.id), "season": f.season, "forecast_data": f.forecast_data,
             "ai_narrative": f.ai_narrative, "generated_at": f.generated_at.isoformat()}
            for f in forecasts
        ]


# ============================================================
# PARENT ENGAGEMENT
# ============================================================

@router.get("/api/organizations/{org_id}/parent-engagement")
async def get_parent_engagement(org_id: str):
    async with async_session() as session:
        engagements = (await session.execute(
            select(ParentEngagement).where(ParentEngagement.org_id == org_id)
        )).scalars().all()
        return [
            {"id": str(e.id), "player_id": str(e.player_id),
             "engagement_score": e.engagement_score, "factors": e.factors,
             "risk_level": e.risk_level, "ai_notes": e.ai_notes}
            for e in engagements
        ]


@router.get("/api/organizations/{org_id}/parent-engagement/at-risk")
async def at_risk_parents(org_id: str):
    async with async_session() as session:
        engagements = (await session.execute(
            select(ParentEngagement, Player)
            .join(Player, ParentEngagement.player_id == Player.id)
            .where(and_(ParentEngagement.org_id == org_id, ParentEngagement.risk_level == "at_risk"))
        )).all()
        return [
            {"player_id": str(e.player_id), "player_name": f"{p.first_name} {p.last_name}",
             "parent_email": p.parent_email, "engagement_score": e.engagement_score,
             "factors": e.factors, "ai_notes": e.ai_notes}
            for e, p in engagements
        ]


@router.post("/api/organizations/{org_id}/parent-engagement/calculate")
async def calculate_parent_engagement(org_id: str):
    async with async_session() as session:
        players = (await session.execute(
            select(Player).where(and_(Player.organization_id == org_id, Player.active == True))
        )).scalars().all()

        results = []
        for player in players:
            # Email engagement — check messages sent/opened
            msg_count = (await session.execute(
                select(func.count()).select_from(MessageRecipient)
                .where(MessageRecipient.player_id == player.id)
            )).scalar() or 0
            opened_count = (await session.execute(
                select(func.count()).select_from(MessageRecipient)
                .where(and_(MessageRecipient.player_id == player.id, MessageRecipient.opened == True))
            )).scalar() or 0
            email_opens = (opened_count / max(msg_count, 1)) * 100

            # Event attendance
            attendance_total = (await session.execute(
                select(func.count()).select_from(AttendanceRecord)
                .where(AttendanceRecord.player_id == player.id)
            )).scalar() or 0
            present_count = (await session.execute(
                select(func.count()).select_from(AttendanceRecord)
                .where(and_(AttendanceRecord.player_id == player.id, AttendanceRecord.status == "present"))
            )).scalar() or 0
            event_attendance = (present_count / max(attendance_total, 1)) * 100

            # Report sent = proxy for payment/engagement
            reports_sent = (await session.execute(
                select(func.count()).select_from(PlayerReport)
                .where(and_(PlayerReport.player_id == player.id, PlayerReport.sent_to_parent == True))
            )).scalar() or 0

            factors = {
                "email_opens": round(email_opens, 1),
                "event_attendance": round(event_attendance, 1),
                "volunteer_hours": 0,
                "survey_responses": min(100, reports_sent * 25),
                "payment_timeliness": 80,  # Default — would need billing integration
            }

            score = (factors["email_opens"] * 0.2 + factors["event_attendance"] * 0.3 +
                     factors["volunteer_hours"] * 0.15 + factors["survey_responses"] * 0.15 +
                     factors["payment_timeliness"] * 0.2)

            risk_level = "healthy" if score >= 60 else "watch" if score >= 35 else "at_risk"

            # Upsert
            existing = (await session.execute(
                select(ParentEngagement).where(
                    and_(ParentEngagement.player_id == player.id, ParentEngagement.org_id == org_id)
                )
            )).scalars().first()

            if existing:
                existing.engagement_score = round(score, 1)
                existing.factors = factors
                existing.risk_level = risk_level
            else:
                pe = ParentEngagement(
                    id=uuid.uuid4(), player_id=player.id, org_id=org_id,
                    engagement_score=round(score, 1), factors=factors, risk_level=risk_level,
                )
                session.add(pe)

            results.append({
                "player_id": str(player.id),
                "player_name": f"{player.first_name} {player.last_name}",
                "score": round(score, 1), "risk_level": risk_level,
            })

        await session.commit()

        healthy = sum(1 for r in results if r["risk_level"] == "healthy")
        watch = sum(1 for r in results if r["risk_level"] == "watch")
        at_risk = sum(1 for r in results if r["risk_level"] == "at_risk")

        return {
            "total_families": len(results),
            "healthy": healthy, "watch": watch, "at_risk": at_risk,
            "results": results,
        }


# ============================================================
# FINANCIAL DASHBOARD
# ============================================================

@router.get("/api/organizations/{org_id}/financial-dashboard")
async def financial_dashboard(org_id: str):
    async with async_session() as session:
        programs = (await session.execute(
            select(Program).where(Program.org_id == org_id)
        )).scalars().all()

        revenue_by_program = {}
        total_revenue = 0
        total_aid_eligible = 0
        total_players_in_programs = 0

        for prog in programs:
            teams = (await session.execute(
                select(Team).where(Team.program_id == prog.id)
            )).scalars().all()
            player_count = 0
            for t in teams:
                count = (await session.execute(
                    select(func.count()).select_from(TeamRoster).where(TeamRoster.team_id == t.id)
                )).scalar() or 0
                player_count += count

            fee = prog.registration_fee or 0
            program_revenue = player_count * fee
            total_revenue += program_revenue
            total_players_in_programs += player_count

            if prog.financial_aid_eligible:
                total_aid_eligible += player_count

            revenue_by_program[prog.name] = {
                "player_count": player_count,
                "fee": fee,
                "revenue": program_revenue,
                "program_type": prog.program_type,
                "financial_aid_eligible": prog.financial_aid_eligible,
            }

        cost_per_player = round(total_revenue / max(total_players_in_programs, 1), 2)
        aid_pct = round(total_aid_eligible / max(total_players_in_programs, 1) * 100, 1)

        return {
            "revenue_by_program": revenue_by_program,
            "total_revenue": total_revenue,
            "total_players": total_players_in_programs,
            "cost_per_player": cost_per_player,
            "financial_aid": {
                "eligible_players": total_aid_eligible,
                "pct_of_total": aid_pct,
                "estimated_aid_amount": round(total_aid_eligible * cost_per_player * 0.5, 2),
            },
            "cash_flow_status": "healthy" if total_revenue > 0 else "needs_attention",
            "program_count": len(programs),
        }


# ============================================================
# SEASONAL REPORTS
# ============================================================

@router.post("/api/organizations/{org_id}/reports/generate")
async def generate_seasonal_report(org_id: str, data: ReportGenerateIn):
    async with async_session() as session:
        # Gather metrics
        total_players = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.active == True)
            )
        )).scalar() or 0
        total_teams = (await session.execute(
            select(func.count()).select_from(Team).where(Team.org_id == org_id)
        )).scalar() or 0
        total_coaches = (await session.execute(
            select(func.count()).select_from(Evaluator).where(
                and_(Evaluator.organization_id == org_id, Evaluator.active == True)
            )
        )).scalar() or 0
        total_programs = (await session.execute(
            select(func.count()).select_from(Program).where(Program.org_id == org_id)
        )).scalar() or 0
        total_evaluations = (await session.execute(
            select(func.count()).select_from(Score).where(Score.event_id.in_(
                select(EvaluationEvent.id).where(EvaluationEvent.organization_id == org_id)
            ))
        )).scalar() or 0
        total_messages = (await session.execute(
            select(func.count()).select_from(Message).where(
                and_(Message.org_id == org_id, Message.status == "sent")
            )
        )).scalar() or 0

        content = {
            "metrics": {
                "total_players": total_players,
                "total_teams": total_teams,
                "total_coaches": total_coaches,
                "total_programs": total_programs,
                "total_evaluations": total_evaluations,
                "total_messages_sent": total_messages,
                "coach_to_player_ratio": f"1:{round(total_players/max(total_coaches,1))}",
            },
            "report_type": data.report_type,
            "season": data.season,
            "generated_at": datetime.utcnow().isoformat(),
        }

        try:
            ai_summary = await call_openai([{"role": "user", "content": f"""Generate a {data.report_type} executive summary for a youth soccer club board report.

Season: {data.season}
Report Type: {data.report_type}
Key Metrics: {json.dumps(content['metrics'])}

Write a professional executive summary (4-6 sentences) suitable for a board presentation. Include key highlights, areas of concern, and forward-looking recommendations. Use specific numbers."""}], max_tokens=600)
        except Exception:
            ai_summary = f"{data.report_type.title()} report for {data.season}. {total_players} players across {total_teams} teams with {total_coaches} coaches."

        report = SeasonReport(
            id=uuid.uuid4(), org_id=org_id, season=data.season,
            report_type=data.report_type, content=content,
            ai_executive_summary=ai_summary,
        )
        session.add(report)
        await session.commit()

        return {
            "id": str(report.id), "season": report.season,
            "report_type": report.report_type, "content": content,
            "ai_executive_summary": ai_summary,
            "generated_at": report.generated_at.isoformat() if report.generated_at else datetime.utcnow().isoformat(),
        }


@router.get("/api/organizations/{org_id}/reports")
async def list_reports(org_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(SeasonReport).where(SeasonReport.org_id == org_id)
            .order_by(SeasonReport.generated_at.desc()).limit(50)
        )
        reports = result.scalars().all()
        return [
            {"id": str(r.id), "season": r.season, "report_type": r.report_type,
             "ai_executive_summary": r.ai_executive_summary,
             "generated_at": r.generated_at.isoformat()}
            for r in reports
        ]


@router.get("/api/organizations/{org_id}/reports/{report_id}")
async def get_report(org_id: str, report_id: str):
    async with async_session() as session:
        report = (await session.execute(
            select(SeasonReport).where(
                and_(SeasonReport.id == report_id, SeasonReport.org_id == org_id)
            )
        )).scalars().first()
        if not report:
            raise HTTPException(404, "Report not found")
        return {
            "id": str(report.id), "season": report.season,
            "report_type": report.report_type, "content": report.content,
            "ai_executive_summary": report.ai_executive_summary,
            "generated_at": report.generated_at.isoformat(),
        }


# ============================================================
# COMPETITION & LEAGUE INTELLIGENCE
# ============================================================

@router.post("/api/organizations/{org_id}/competition/results")
async def submit_match_result(org_id: str, data: MatchResultIn):
    async with async_session() as session:
        result = CompetitionResult(
            id=uuid.uuid4(), org_id=org_id, team_id=data.team_id,
            opponent_name=data.opponent_name, league=data.league,
            match_date=date.fromisoformat(data.match_date),
            result=data.result, score_for=data.score_for,
            score_against=data.score_against,
            goal_scorers=data.goal_scorers, assists=data.assists,
            notes=data.notes,
        )
        session.add(result)
        await session.commit()
        return {"id": str(result.id), "message": "Match result recorded"}


@router.get("/api/organizations/{org_id}/competition/standings")
async def competition_standings(org_id: str):
    async with async_session() as session:
        results = (await session.execute(
            select(CompetitionResult).where(CompetitionResult.org_id == org_id)
            .order_by(CompetitionResult.match_date.desc())
        )).scalars().all()

        # Aggregate by team
        team_records = {}
        team_leagues = {}  # track most common league per team
        for r in results:
            tid = str(r.team_id)
            if tid not in team_records:
                team_records[tid] = {"wins": 0, "losses": 0, "draws": 0, "goals_for": 0, "goals_against": 0, "matches": 0}
            team_records[tid]["matches"] += 1
            team_records[tid]["goals_for"] += r.score_for or 0
            team_records[tid]["goals_against"] += r.score_against or 0
            if r.result == "win":
                team_records[tid]["wins"] += 1
            elif r.result == "loss":
                team_records[tid]["losses"] += 1
            else:
                team_records[tid]["draws"] += 1
            # Track league
            if r.league:
                team_leagues.setdefault(tid, {})
                team_leagues[tid][r.league] = team_leagues[tid].get(r.league, 0) + 1

        # Get team names and determine primary league
        standings = []
        for tid, record in team_records.items():
            team = (await session.execute(select(Team).where(Team.id == tid))).scalars().first()
            record["team_id"] = tid
            record["team_name"] = team.name if team else "Unknown"
            record["points"] = record["wins"] * 3 + record["draws"]
            record["goal_difference"] = record["goals_for"] - record["goals_against"]
            # Primary league = most frequent league for this team
            if tid in team_leagues and team_leagues[tid]:
                record["league"] = max(team_leagues[tid], key=team_leagues[tid].get)
            else:
                record["league"] = None
            standings.append(record)

        standings.sort(key=lambda x: (x["points"], x["goal_difference"]), reverse=True)
        return standings


@router.get("/api/organizations/{org_id}/competition/stats")
async def competition_stats(org_id: str):
    async with async_session() as session:
        results = (await session.execute(
            select(CompetitionResult).where(CompetitionResult.org_id == org_id)
        )).scalars().all()

        # Aggregate player stats
        player_goals = {}
        player_assists = {}
        for r in results:
            for gs in (r.goal_scorers or []):
                pid = gs.get("player_id", gs.get("player_name", "unknown"))
                name = gs.get("player_name", pid)
                player_goals.setdefault(pid, {"name": name, "goals": 0})
                player_goals[pid]["goals"] += gs.get("count", 1)
            for a in (r.assists or []):
                pid = a.get("player_id", a.get("player_name", "unknown"))
                name = a.get("player_name", pid)
                player_assists.setdefault(pid, {"name": name, "assists": 0})
                player_assists[pid]["assists"] += a.get("count", 1)

        top_scorers = sorted(player_goals.values(), key=lambda x: x["goals"], reverse=True)[:20]
        top_assists = sorted(player_assists.values(), key=lambda x: x["assists"], reverse=True)[:20]

        return {
            "total_matches": len(results),
            "top_scorers": top_scorers,
            "top_assists": top_assists,
        }


# ============================================================
# COMPLIANCE DASHBOARD
# ============================================================

@router.get("/api/organizations/{org_id}/compliance")
async def compliance_dashboard(org_id: str):
    async with async_session() as session:
        items = (await session.execute(
            select(ComplianceItem).where(ComplianceItem.org_id == org_id)
        )).scalars().all()

        total = len(items)
        compliant = sum(1 for i in items if i.status == "compliant")
        expiring = sum(1 for i in items if i.status == "expiring")
        expired = sum(1 for i in items if i.status == "expired")
        missing = sum(1 for i in items if i.status == "missing")

        by_type = {}
        for i in items:
            by_type.setdefault(i.item_type, {"compliant": 0, "expiring": 0, "expired": 0, "missing": 0})
            by_type[i.item_type][i.status] = by_type[i.item_type].get(i.status, 0) + 1

        compliance_pct = round(compliant / max(total, 1) * 100, 1)

        return {
            "total_people": total,
            "compliant_count": compliant,
            "expiring_count": expiring,
            "expired_count": expired,
            "missing_count": missing,
            "compliance_pct": compliance_pct,
            "items_by_type": by_type,
            "items": [
                {"id": str(i.id), "item_type": i.item_type, "person_name": i.person_name,
                 "person_role": i.person_role, "status": i.status,
                 "expiry_date": i.expiry_date.isoformat() if i.expiry_date else None,
                 "notes": i.notes}
                for i in items
            ],
        }


@router.post("/api/organizations/{org_id}/compliance/items")
async def add_compliance_item(org_id: str, data: ComplianceItemIn):
    async with async_session() as session:
        item = ComplianceItem(
            id=uuid.uuid4(), org_id=org_id,
            item_type=data.item_type, person_name=data.person_name,
            person_role=data.person_role, status=data.status,
            expiry_date=date.fromisoformat(data.expiry_date) if data.expiry_date else None,
            document_id=data.document_id, notes=data.notes,
        )
        session.add(item)
        await session.commit()
        return {"id": str(item.id), "message": "Compliance item added"}


@router.get("/api/organizations/{org_id}/compliance/expiring")
async def expiring_compliance(org_id: str):
    async with async_session() as session:
        cutoff = date.today() + timedelta(days=30)
        items = (await session.execute(
            select(ComplianceItem).where(
                and_(
                    ComplianceItem.org_id == org_id,
                    ComplianceItem.expiry_date != None,
                    ComplianceItem.expiry_date <= cutoff,
                    ComplianceItem.status.in_(["compliant", "expiring"]),
                )
            ).order_by(ComplianceItem.expiry_date.asc())
        )).scalars().all()

        return [
            {"id": str(i.id), "item_type": i.item_type, "person_name": i.person_name,
             "person_role": i.person_role, "status": i.status,
             "expiry_date": i.expiry_date.isoformat() if i.expiry_date else None,
             "days_until_expiry": (i.expiry_date - date.today()).days if i.expiry_date else None}
            for i in items
        ]


# ============================================================
# OPERATIONAL REPORTING — Daily/Monthly/Annual Metrics
# ============================================================

@router.get("/api/organizations/{org_id}/metrics/daily")
async def daily_metrics(org_id: str):
    async with async_session() as session:
        today = date.today()
        today_start = datetime(today.year, today.month, today.day)

        reg_today = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.created_at >= today_start)
            )
        )).scalar() or 0

        total_players = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.active == True)
            )
        )).scalar() or 0

        msgs_today = (await session.execute(
            select(func.count()).select_from(Message).where(
                and_(Message.org_id == org_id, Message.created_at >= today_start)
            )
        )).scalar() or 0

        return {
            "date": today.isoformat(),
            "registrations_today": reg_today,
            "total_active_players": total_players,
            "new_inquiries": msgs_today,
            "alerts": [],
        }


@router.get("/api/organizations/{org_id}/metrics/monthly")
async def monthly_metrics(org_id: str):
    async with async_session() as session:
        today = date.today()
        month_start = datetime(today.year, today.month, 1)

        reg_this_month = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.created_at >= month_start)
            )
        )).scalar() or 0

        programs = (await session.execute(
            select(Program).where(Program.org_id == org_id)
        )).scalars().all()
        total_revenue = sum((p.registration_fee or 0) for p in programs)

        return {
            "month": today.strftime("%B %Y"),
            "registrations_this_month": reg_this_month,
            "estimated_revenue": total_revenue,
            "program_count": len(programs),
        }


@router.get("/api/organizations/{org_id}/metrics/annual")
async def annual_metrics(org_id: str):
    async with async_session() as session:
        today = date.today()
        year_start = datetime(today.year, 1, 1)

        reg_this_year = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.created_at >= year_start)
            )
        )).scalar() or 0

        total_players = (await session.execute(
            select(func.count()).select_from(Player).where(Player.organization_id == org_id)
        )).scalar() or 0

        total_coaches = (await session.execute(
            select(func.count()).select_from(Evaluator).where(Evaluator.organization_id == org_id)
        )).scalar() or 0

        total_teams = (await session.execute(
            select(func.count()).select_from(Team).where(Team.org_id == org_id)
        )).scalar() or 0

        return {
            "year": today.year,
            "registrations_this_year": reg_this_year,
            "total_players_all_time": total_players,
            "total_coaches": total_coaches,
            "total_teams": total_teams,
        }


@router.get("/api/organizations/{org_id}/metrics/operational")
async def operational_metrics(org_id: str):
    """Reach, Engagement, Program Value, Efficiency metrics."""
    async with async_session() as session:
        total_players = (await session.execute(
            select(func.count()).select_from(Player).where(
                and_(Player.organization_id == org_id, Player.active == True)
            )
        )).scalar() or 0
        total_coaches = (await session.execute(
            select(func.count()).select_from(Evaluator).where(
                and_(Evaluator.organization_id == org_id, Evaluator.active == True)
            )
        )).scalar() or 0
        total_attendance = (await session.execute(
            select(func.count()).select_from(AttendanceRecord).where(AttendanceRecord.org_id == org_id)
        )).scalar() or 0
        present_attendance = (await session.execute(
            select(func.count()).select_from(AttendanceRecord).where(
                and_(AttendanceRecord.org_id == org_id, AttendanceRecord.status == "present")
            )
        )).scalar() or 0
        volunteer_hours = (await session.execute(
            select(func.sum(Evaluator.volunteer_hours)).where(
                and_(Evaluator.organization_id == org_id, Evaluator.active == True)
            )
        )).scalar() or 0

        attendance_rate = round(present_attendance / max(total_attendance, 1) * 100, 1)

        return {
            "reach_access": {
                "total_registrations": total_players,
                "coach_count": total_coaches,
            },
            "engagement": {
                "attendance_rate": attendance_rate,
                "total_sessions_tracked": total_attendance,
            },
            "program_value": {
                "coach_to_player_ratio": f"1:{round(total_players / max(total_coaches, 1))}",
                "volunteer_hours": volunteer_hours,
            },
            "efficiency": {
                "players_per_coach": round(total_players / max(total_coaches, 1), 1),
            },
        }


# ============================================================
# IYSL Best Practice Statements with Benchmarks
# ============================================================

@router.get("/api/iysl/statements")
async def get_iysl_statements():
    """Return all 60 IYSL best practice statements with benchmark data from 2,500+ clubs."""
    return {
        "total_statements": 60,
        "benchmarked_clubs": 2500,
        "departments": IYSL_DEPARTMENT_QUESTIONS,
        "roles": IYSL_ROLE_QUESTIONS,
        "statements": IYSL_STATEMENTS,
        "benchmarks": IYSL_ALL_CLUBS_AVG,
        "top_10_benchmarks": IYSL_TOP_10_PCT,
        "lifecycle_phases": {
            "1": "Formation",
            "2": "Growth",
            "3": "Development",
            "4": "Performance",
            "5": "Model Club"
        },
        "lifecycle_factors": [
            "Leadership Structure",
            "Community Connection",
            "Right People in Right Seats",
            "Staffing Structure",
            "Strategic Planning",
            "Administrative Structure",
            "Facilities Access",
            "Operational Planning",
            "Program Oversight",
            "Revenue Portfolio"
        ]
    }


# ============================================================
# RECENT ACTIVITY FEED
# ============================================================

@router.get("/api/organizations/{org_id}/activity")
async def get_recent_activity(org_id: str):
    """Return the last 20 activities across all modules for an organization."""
    activities = []
    async with async_session() as session:
        # Player registrations
        rows = (await session.execute(
            select(Player).where(Player.organization_id == org_id)
            .order_by(Player.created_at.desc()).limit(20)
        )).scalars().all()
        for r in rows:
            activities.append({
                "type": "player",
                "description": f"{r.first_name} {r.last_name} registered",
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "icon": "user-plus",
            })

        # Score submissions
        rows = (await session.execute(
            select(Score).join(Player, Score.player_id == Player.id)
            .join(Evaluator, Score.evaluator_id == Evaluator.id)
            .where(Player.organization_id == org_id)
            .order_by(Score.scored_at.desc()).limit(20)
        )).scalars().all()
        # Group scores by evaluator + time (within 5 min) to summarize
        eval_batches = {}
        for s in rows:
            key = str(s.evaluator_id)
            if key not in eval_batches:
                eval_batches[key] = {"count": 0, "timestamp": s.scored_at, "evaluator_id": s.evaluator_id}
            eval_batches[key]["count"] += 1
        for key, batch in eval_batches.items():
            # Fetch evaluator name
            ev = (await session.execute(
                select(Evaluator).where(Evaluator.id == batch["evaluator_id"])
            )).scalar()
            name = ev.name if ev else "Unknown"
            activities.append({
                "type": "score",
                "description": f"Coach {name} scored {batch['count']} players",
                "timestamp": batch["timestamp"].isoformat() if batch["timestamp"] else None,
                "icon": "clipboard-check",
            })

        # Report generations
        rows = (await session.execute(
            select(PlayerReport).where(PlayerReport.organization_id == org_id)
            .order_by(PlayerReport.created_at.desc()).limit(20)
        )).scalars().all()
        for r in rows:
            activities.append({
                "type": "report",
                "description": "Player report generated",
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "icon": "file-bar-chart",
            })

        # Match results added
        rows = (await session.execute(
            select(CompetitionResult).where(CompetitionResult.org_id == org_id)
            .order_by(CompetitionResult.created_at.desc()).limit(20)
        )).scalars().all()
        for r in rows:
            activities.append({
                "type": "match",
                "description": f"Match result: {r.result} vs {r.opponent_name} ({r.score_for}-{r.score_against})",
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "icon": "swords",
            })

        # Messages sent
        rows = (await session.execute(
            select(Message).where(
                and_(Message.org_id == org_id, Message.status == "sent")
            ).order_by(Message.sent_at.desc()).limit(20)
        )).scalars().all()
        for r in rows:
            activities.append({
                "type": "message",
                "description": f"Message sent: {r.subject or 'No subject'}",
                "timestamp": (r.sent_at or r.created_at).isoformat() if (r.sent_at or r.created_at) else None,
                "icon": "mail",
            })

        # Attendance recorded
        rows = (await session.execute(
            select(AttendanceRecord).where(AttendanceRecord.org_id == org_id)
            .order_by(AttendanceRecord.created_at.desc()).limit(20)
        )).scalars().all()
        for r in rows:
            activities.append({
                "type": "attendance",
                "description": f"Attendance recorded ({r.status})",
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "icon": "clipboard-check",
            })

        # Document uploads
        rows = (await session.execute(
            select(PlayerDocument).where(PlayerDocument.org_id == org_id)
            .order_by(PlayerDocument.created_at.desc()).limit(20)
        )).scalars().all()
        for r in rows:
            activities.append({
                "type": "document",
                "description": f"Document uploaded: {r.document_type} ({r.file_name or 'unnamed'})",
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "icon": "folder-open",
            })

    # Sort all activities by timestamp descending, take top 20
    activities.sort(key=lambda a: a["timestamp"] or "", reverse=True)
    return activities[:20]


# ============================================================
# SEASON COMPARISON ANALYTICS
# ============================================================

@router.get("/api/organizations/{org_id}/analytics/season-comparison")
async def get_season_comparison(org_id: str, season1: str, season2: str):
    """Compare two seasons side-by-side with change metrics."""
    async with async_session() as session:
        async def season_stats(season_name: str):
            # Find season record
            season_row = (await session.execute(
                select(Season).where(
                    and_(Season.org_id == org_id, Season.name == season_name)
                )
            )).scalar()

            if not season_row:
                return {
                    "name": season_name,
                    "total_players": 0,
                    "total_teams": 0,
                    "avg_score": 0,
                    "retention_rate": 0,
                    "match_record": {"wins": 0, "losses": 0, "draws": 0},
                }

            sid = season_row.id

            # Teams in this season
            teams = (await session.execute(
                select(Team).where(Team.season_id == sid)
            )).scalars().all()
            team_ids = [t.id for t in teams]
            total_teams = len(teams)

            # Players in those teams
            total_players = 0
            if team_ids:
                total_players = (await session.execute(
                    select(func.count(func.distinct(TeamRoster.player_id)))
                    .where(TeamRoster.team_id.in_(team_ids))
                )).scalar() or 0

            # Avg score from competition results
            avg_score = 0.0
            wins = losses = draws = 0
            if team_ids:
                results = (await session.execute(
                    select(CompetitionResult).where(
                        CompetitionResult.team_id.in_(team_ids)
                    )
                )).scalars().all()
                for r in results:
                    if r.result == "win":
                        wins += 1
                    elif r.result == "loss":
                        losses += 1
                    elif r.result == "draw":
                        draws += 1

                # Avg evaluation score for players in this season
                if total_players > 0:
                    player_ids_q = select(TeamRoster.player_id).where(
                        TeamRoster.team_id.in_(team_ids)
                    )
                    avg_val = (await session.execute(
                        select(func.avg(Score.score_value)).where(
                            Score.player_id.in_(player_ids_q)
                        )
                    )).scalar()
                    avg_score = round(float(avg_val), 2) if avg_val else 0.0

            # Retention: players who were also in any other season
            retention_rate = 0.0
            if total_players > 0:
                current_player_ids = (await session.execute(
                    select(TeamRoster.player_id).where(TeamRoster.team_id.in_(team_ids))
                )).scalars().all()
                other_season_teams = (await session.execute(
                    select(Team.id).where(
                        and_(Team.org_id == org_id, Team.season_id != sid)
                    )
                )).scalars().all()
                if other_season_teams:
                    retained = (await session.execute(
                        select(func.count(func.distinct(TeamRoster.player_id)))
                        .where(
                            and_(
                                TeamRoster.team_id.in_(other_season_teams),
                                TeamRoster.player_id.in_(current_player_ids),
                            )
                        )
                    )).scalar() or 0
                    retention_rate = round(retained / total_players * 100, 1)

            return {
                "name": season_name,
                "total_players": total_players,
                "total_teams": total_teams,
                "avg_score": avg_score,
                "retention_rate": retention_rate,
                "match_record": {"wins": wins, "losses": losses, "draws": draws},
            }

        s1 = await season_stats(season1)
        s2 = await season_stats(season2)

        def pct_change(new, old):
            if old == 0:
                return "+100%" if new > 0 else "0%"
            change = round((new - old) / old * 100)
            return f"+{change}%" if change >= 0 else f"{change}%"

        def diff(new, old):
            d = new - old
            return f"+{d}" if d >= 0 else str(d)

        changes = {
            "players": pct_change(s2["total_players"], s1["total_players"]),
            "teams": diff(s2["total_teams"], s1["total_teams"]),
            "avg_score": diff(round(s2["avg_score"] - s1["avg_score"], 1), 0).replace("+0", "0"),
            "retention": diff(round(s2["retention_rate"] - s1["retention_rate"], 1), 0).replace("+0", "0") + "%",
        }

        return {"season1": s1, "season2": s2, "changes": changes}
