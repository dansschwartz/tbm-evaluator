# TBM Operations

**AI-Native Sports Club Operating System**

A comprehensive platform for managing youth sports organizations — evaluations, team building, field management, scheduling, communications, and more. Built with AI at the core.

**Live:** [tbm-evaluator-production.up.railway.app](https://tbm-evaluator-production.up.railway.app)

## Platform Modules

| Module | Features |
|--------|----------|
| **Player Evaluation** | Mobile scoring, AI reports, development plans, position profiling |
| **Team Building** | AI-balanced teams, draft mode, position-based formation |
| **Field Management** | Field inventory, bookings, availability search, AI optimization |
| **Scheduling** | Game/practice generation, conflict detection, calendar views |
| **Communications** | Email/SMS with AI drafting, audience targeting, templates |
| **Coach Management** | Certifications, availability, AI team-coach matching |
| **Attendance** | QR check-in, tracking, AI at-risk detection |
| **AI Operations** | Natural language queries, proactive alerts, smart insights |
| **Analytics** | Registration trends, retention, field utilization, demographics |
| **Document Vault** | Waivers, medical forms, compliance tracking |
| **PlayMetrics Import** | CSV sync with auto-mapping, duplicate detection |
| **Parent Portal** | Report cards, development plans, progress tracking |

## Tech Stack

- **Backend:** Python 3.12 + FastAPI (async)
- **Database:** PostgreSQL + Neon
- **AI:** OpenAI GPT-4o-mini
- **Frontend:** Vanilla JS + Lucide Icons
- **Deploy:** Railway (Docker)

## Quick Start

```bash
# Set environment variables
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
ADMIN_API_KEY=your-key

# Deploy to Railway (auto-deploys from GitHub)
# Tables auto-create on startup

# Seed demo data
python3 scripts/seed_demo.py --api-url https://your-app.up.railway.app --admin-key your-key
python3 scripts/seed_operations.py --api-url https://your-app.up.railway.app --admin-key your-key
```

## URLs

| Path | What |
|------|------|
| `/admin` | Full operations dashboard |
| `/score` | Mobile scoring for coaches |
| `/parent` | Parent report portal |
| `/self-assess` | Player self-assessment |
| `/report/{id}` | Public report card |
| `/docs` | API documentation |
| `/health` | Health check |

## Stats

- **70+ features**
- **24 database models**
- **100+ API endpoints**
- **16,500+ lines of code**

## License

Private — proprietary software.
