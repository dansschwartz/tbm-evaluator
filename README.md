# TBM Evaluator

AI-native player evaluation platform for youth sports organizations. A SkillShark competitor with AI-powered report generation, mobile scoring, team drafting, and parent report cards.

## Features

- **Multi-tenant**: Support multiple organizations/clubs
- **Evaluation Templates**: Pre-built templates for soccer, basketball, baseball (customizable)
- **Mobile Scoring**: Phone-friendly scoring interface for evaluators at tryouts/camps
- **AI Report Cards**: OpenAI-generated player summaries, strengths, improvements, and recommendations
- **Team Drafting**: Manual picks or AI-balanced team distribution
- **Email Notifications**: Send report cards directly to parents
- **Analytics Dashboard**: Score distributions, skill averages, top performers

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy (async) + asyncpg
- **Database**: PostgreSQL (Neon)
- **AI**: OpenAI GPT-4o-mini
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Deployment**: Docker + Railway

## Quick Start

### Local Development

```bash
# Clone and setup
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY

# With Docker
docker-compose up

# Without Docker
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Deploy to Railway

1. Connect your GitHub repo to Railway
2. Add environment variables (DATABASE_URL, OPENAI_API_KEY, ADMIN_API_KEY, BASE_URL)
3. Railway auto-detects the Dockerfile

## Usage Flow

1. **Admin Setup** (`/admin`): Create organization, configure evaluation template
2. **Player Import**: Add players via admin dashboard (single or bulk)
3. **Create Event**: Set up tryout/camp with template and players
4. **Score** (`/score`): Evaluators login with access code, score players on mobile
5. **Generate Reports**: Admin triggers AI report generation
6. **Review & Send**: View reports, then email report cards to parents
7. **Draft Teams**: Create balanced teams via manual picks or AI auto-balance

## API Endpoints

### Organizations
- `POST /api/organizations` — Create org
- `GET /api/organizations` — List orgs
- `GET/PATCH/DELETE /api/organizations/{id}` — CRUD

### Templates
- `POST /api/organizations/{org_id}/templates` — Create template
- `GET /api/organizations/{org_id}/templates` — List
- `GET /api/templates/presets/{sport}` — Sport presets (soccer, basketball, baseball)

### Players
- `POST /api/organizations/{org_id}/players` — Create player
- `POST /api/organizations/{org_id}/players/bulk` — Bulk import
- `GET /api/organizations/{org_id}/players` — List (filter by age_group, active)

### Events
- `POST /api/organizations/{org_id}/events` — Create event
- `POST /api/events/{id}/players` — Add players to event
- `POST /api/events/{id}/check-in/{player_id}` — Check in player

### Scoring
- `POST /api/evaluators/login` — Evaluator login with access code
- `GET /api/scoring/event/{event_id}` — Get scoring data
- `POST /api/scoring/scores` — Submit scores (batch)

### Reports
- `POST /api/events/{id}/generate-reports` — Generate AI reports
- `GET /api/reports/{id}/public` — Public report (no auth)
- `POST /api/events/{id}/send-reports` — Email report cards

### Draft
- `POST /api/events/{id}/draft/teams` — Create teams
- `POST /api/events/{id}/draft/pick` — Manual pick
- `POST /api/events/{id}/draft/auto-balance` — AI auto-balance

### Analytics
- `GET /api/organizations/{org_id}/analytics` — Org dashboard
- `GET /api/events/{id}/analytics` — Event analytics

## Authentication

- **Admin**: `X-Admin-Key` header on all admin endpoints
- **Evaluators**: 6-character access code (no passwords)
- **Public**: Report card viewer requires no auth

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| OPENAI_API_KEY | Yes | OpenAI API key |
| ADMIN_API_KEY | Yes | Admin dashboard auth key |
| BASE_URL | No | App URL for report links |
| SMTP_HOST | No | Email server |
| SMTP_PORT | No | Email port (default 587) |
| SMTP_USER | No | Email username |
| SMTP_PASSWORD | No | Email password |
| SMTP_FROM_EMAIL | No | Sender email address |
