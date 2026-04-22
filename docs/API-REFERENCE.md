# TBM Evaluator — API Reference

Base URL: `https://tbm-evaluator-production.up.railway.app`

## Authentication

Admin endpoints require `X-Admin-Key` header.
Evaluator endpoints use access codes (6-character codes).
Parent portal uses email lookup (no password).

---

## Organizations

### Create Organization
```
POST /api/organizations
Headers: X-Admin-Key
```
```json
{
  "name": "DC Soccer Club",
  "slug": "dcsc",
  "sport": "soccer",
  "contact_email": "info@dcsoccerclub.org",
  "primary_color": "#c41e3a",
  "secondary_color": "#0f0f23"
}
```
**Response:** Organization object with auto-generated `api_key`

### List / Get / Update / Delete
```
GET    /api/organizations                    — List all
GET    /api/organizations/{id}               — Get detail
PATCH  /api/organizations/{id}               — Update
DELETE /api/organizations/{id}               — Delete
```

---

## Evaluation Templates

### Create Template
```
POST /api/organizations/{org_id}/templates
```
```json
{
  "name": "Spring 2026 Tryout Template",
  "sport": "soccer",
  "skills": [
    {
      "name": "Dribbling",
      "category": "Technical",
      "scoring_type": "scale_1_5",
      "weight": 1.0,
      "description": "Ball control and dribbling ability"
    },
    {
      "name": "40-Yard Dash",
      "category": "Physical",
      "scoring_type": "timed_seconds",
      "weight": 0.8,
      "description": "Sprint speed"
    }
  ],
  "categories": ["Technical", "Tactical", "Physical", "Mental"]
}
```

Scoring types: `scale_1_5`, `scale_1_10`, `pass_fail`, `timed_seconds`, `numeric`

### Get Sport Presets
```
GET /api/templates/presets/{sport}
```
Available sports: `soccer`, `basketball`, `baseball`

Returns a pre-built template with sport-specific skills.

### List / Get / Update / Delete
```
GET    /api/organizations/{org_id}/templates   — List
GET    /api/templates/{id}                      — Detail
PATCH  /api/templates/{id}                      — Update
DELETE /api/templates/{id}                      — Delete
```

---

## Players

### Create Player
```
POST /api/organizations/{org_id}/players
```
```json
{
  "first_name": "Marcus",
  "last_name": "Johnson",
  "date_of_birth": "2014-03-15",
  "age_group": "U12",
  "position": "Midfielder",
  "parent_name": "Sarah Johnson",
  "parent_email": "sarah@example.com",
  "parent_phone": "202-555-0123"
}
```

### Bulk Import
```
POST /api/organizations/{org_id}/players/bulk
```
```json
[
  {"first_name": "Marcus", "last_name": "Johnson", "age_group": "U12"},
  {"first_name": "Sofia", "last_name": "Rodriguez", "age_group": "U12"}
]
```

### CSV Import
```
POST /api/organizations/{org_id}/players/import-csv
Content-Type: text/csv
```
```csv
first_name,last_name,date_of_birth,age_group,position,parent_name,parent_email
Marcus,Johnson,2014-03-15,U12,Midfielder,Sarah Johnson,sarah@example.com
Sofia,Rodriguez,2014-07-22,U12,Forward,Maria Rodriguez,maria@example.com
```

### Player Progress
```
GET /api/players/{id}/progress
```
Returns all reports across events with score trends per skill.

### Export
```
GET /api/organizations/{org_id}/players/export
```
Returns CSV of all players.

### List / Get / Update / Delete
```
GET    /api/organizations/{org_id}/players?age_group=U12   — List (filterable)
GET    /api/players/{id}                                     — Detail + history
PATCH  /api/players/{id}                                     — Update
PUT    /api/players/{id}/photo                               — Upload photo (base64)
DELETE /api/players/{id}                                     — Delete
```

---

## Evaluation Events

### Create Event
```
POST /api/organizations/{org_id}/events
```
```json
{
  "name": "Spring 2026 U12 Tryouts",
  "template_id": "uuid",
  "event_type": "tryout",
  "event_date": "2026-04-27",
  "location": "Mann Elementary School",
  "season": "Spring 2026"
}
```
Event types: `tryout`, `camp`, `clinic`, `combine`, `mid_season`, `year_end`

### Manage Players in Event
```
POST   /api/events/{id}/players              — Add players (array of player_ids)
DELETE /api/events/{id}/players/{player_id}  — Remove player
POST   /api/events/{id}/check-in/{player_id} — Check in player
GET    /api/events/{id}/check-in-codes       — Get QR check-in codes
```

### Export Scores
```
GET /api/events/{id}/export?format=csv    — CSV export
GET /api/events/{id}/export?format=json   — JSON export
```

### Compare Players
```
GET /api/events/{id}/compare?player_ids=id1,id2,id3
```
Returns side-by-side skill scores for selected players.

### List / Get / Update / Delete
```
GET    /api/organizations/{org_id}/events?season=Spring+2026  — List
GET    /api/events/{id}                                         — Detail
PATCH  /api/events/{id}                                         — Update
DELETE /api/events/{id}                                         — Delete
```

---

## Evaluators

### Create Evaluator
```
POST /api/organizations/{org_id}/evaluators
```
```json
{
  "name": "Coach Matt",
  "email": "matt@dcsoccerclub.org"
}
```
**Response:** Includes auto-generated 6-character `access_code`

### Evaluator Login (for scoring app)
```
POST /api/evaluators/login
```
```json
{
  "access_code": "ABC123"
}
```
Returns evaluator info + list of active events.

---

## Scoring

### Get Event for Scoring
```
GET /api/scoring/event/{event_id}
```
Returns event info, template (skills list), and all players. Used by the mobile scoring UI.

### Submit Scores
```
POST /api/scoring/scores
```
```json
{
  "event_id": "uuid",
  "evaluator_id": "uuid",
  "scores": [
    {"player_id": "uuid", "skill_name": "Dribbling", "score_value": 4.0, "comment": "Great close control"},
    {"player_id": "uuid", "skill_name": "Passing", "score_value": 3.0, "comment": "Needs work on long balls"}
  ]
}
```

### Get Existing Scores
```
GET /api/scoring/event/{event_id}/player/{player_id}
```

### Natural Language Scoring (AI)
```
POST /api/scoring/parse-natural
```
```json
{
  "text": "Marcus dribbling 4, passing 2, great attitude, coachability 5",
  "template_id": "uuid"
}
```
Returns parsed scores matching template skill names.

### Submit Self-Assessment
```
POST /api/events/{event_id}/self-assess
```
```json
{
  "player_id": "uuid",
  "scores": {"Dribbling": 4, "Passing": 3, "Speed": 5}
}
```

---

## Reports

### Generate Reports for Event
```
POST /api/events/{id}/generate-reports
```
Calculates weighted scores, rankings, and generates AI summaries for ALL players in the event. Process inline — may take 30-60 seconds for large events.

**Response:**
```json
{
  "reports_generated": 45,
  "event_id": "uuid"
}
```

### Get Reports
```
GET /api/events/{id}/reports                — All reports for event
GET /api/reports/{id}                        — Single report detail
GET /api/reports/{id}/public                 — Public view (no auth, for parent links)
GET /api/reports/{id}/pdf                    — Download as PDF
```

### Send Reports to Parents
```
POST /api/events/{id}/send-reports
```
Emails report cards to all parents with valid email addresses.

### Report Response Format
```json
{
  "id": "uuid",
  "player_name": "Marcus Johnson",
  "event_name": "Spring 2026 U12 Tryouts",
  "overall_score": 3.85,
  "rank": 3,
  "total_players": 45,
  "skill_scores": {
    "Dribbling": 4.5,
    "Passing": 3.0,
    "Shooting": 4.0,
    "Game Intelligence": 4.0,
    "Speed": 3.5,
    "Coachability": 5.0
  },
  "ai_summary": "Marcus demonstrates excellent ball control and coachability...",
  "ai_strengths": ["Ball Control", "Coachability", "Shooting"],
  "ai_improvements": ["Passing Accuracy", "Stamina", "Heading"],
  "ai_recommendation": "Ready for Travel-level competition. Strong candidate for Blue team.",
  "report_url": "https://tbm-evaluator-production.up.railway.app/report/uuid",
  "sent_to_parent": true
}
```

---

## Draft / Team Building

### Create Teams
```
POST /api/events/{id}/draft/teams
```
```json
{
  "teams": [
    {"team_name": "Blue", "team_color": "#0000ff"},
    {"team_name": "Red", "team_color": "#ff0000"},
    {"team_name": "White", "team_color": "#ffffff"}
  ]
}
```

### Make Draft Pick
```
POST /api/events/{id}/draft/pick
```
```json
{
  "team_id": "uuid",
  "player_id": "uuid"
}
```

### AI Auto-Balance Teams
```
POST /api/events/{id}/draft/auto-balance
```
AI distributes all players across teams for maximum balance based on weighted scores and optionally positions.

### AI Team Analysis
```
POST /api/events/{id}/draft/analyze
```
AI reviews each team's composition and suggests improvements.

### Get Draft State
```
GET /api/events/{id}/draft
```
Returns all teams, picks, and available players with rankings.

### Export Teams
```
GET /api/events/{id}/draft/export?format=csv
```

---

## AI Endpoints

### AI Coach Assistant
```
POST /api/ai/ask
```
```json
{
  "organization_id": "uuid",
  "question": "Which U12 players should move up to Travel based on recent evaluations?"
}
```
Returns AI-generated answer based on all evaluation data.

### Evaluator Calibration
```
GET /api/events/{id}/calibration
```
Analyzes evaluator scoring patterns. Returns deviation analysis and flags.

---

## Parent Portal

### Look Up Reports
```
GET /api/parent/reports?email=sarah@example.com
```
Returns all reports for players associated with that parent email.

---

## Analytics

### Organization Dashboard
```
GET /api/organizations/{org_id}/analytics
```
Returns: total players, events, evaluations, avg scores, top performers, recent activity.

### Event Analytics
```
GET /api/events/{id}/analytics
```
Returns: score distributions, evaluator agreement, top/bottom performers, category averages.

---

## Webhooks

Configure `webhook_url` on an organization. Events fired:
- `event.completed` — when event status changes to completed
- `report.generated` — when reports are generated
- `report.sent` — when reports are emailed to parents

---

## Widget Embed (Scoring)

For evaluators to score on their phones:
```
https://tbm-evaluator-production.up.railway.app/score
```
Enter access code → select event → score players.

## Parent Reports

Parents view reports at:
```
https://tbm-evaluator-production.up.railway.app/report/{report_id}
```

## Admin Dashboard

Full management at:
```
https://tbm-evaluator-production.up.railway.app/admin
```
