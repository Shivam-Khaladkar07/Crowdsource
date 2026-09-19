# CivicForge — Jharkhand

**From Community Problems to Deployable Solutions.** CivicForge is an SIH 2026 GovTech prototype that turns community-reported societal problems into validated university–industry innovation projects.

> **Demo Environment:** all seeded records, impact figures, institutional profiles, and coordinates are synthetic prototype data. They are not official government data.

## Product flow

Citizen → AI intelligence → human validation → challenge cluster → university match → multidisciplinary team → industry offer → prototype → pilot → deployment → impact.

AI is always advisory: validation and university assignment require a human decision. The **CivicForge Decision Support Score** and university-match weights are configurable by an admin and are not a scientific universal formula. Predicted and verified impact remain separate.

## Architecture

- `frontend/`: React, TypeScript, Vite, Tailwind, shadcn-style primitives, Leaflet/OpenStreetMap, and Recharts.
- `backend/`: Express REST API, JWT authentication, bcrypt password hashing, server-enforced RBAC, request validation, rate limiting, Helmet, audit logs, and validated uploads.
- Database: PostgreSQL when `DATABASE_URL` is configured; otherwise PGlite, a local PostgreSQL-compatible embedded engine.
- AI: `AIProvider` interface with deterministic **Demo AI Mode**. It classifies, summarizes, embeds, finds related reports with cosine similarity, extracts skills/technologies, and works without any API key.

## Setup

```bash
npm install
npm run install:all
npm run dev
```

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

Use one process per PGlite directory. Configure `PGLITE_DATA_DIR` for isolated local instances, or use a production PostgreSQL `DATABASE_URL`.

### Environment

Copy `backend/.env.example` to `backend/.env` and set:

```env
PORT=4000
JWT_SECRET=replace-in-production
DATABASE_URL=postgres://user:password@host:5432/civicforge  # optional
PGLITE_DATA_DIR=./data/pglite                              # optional local fallback
UPLOAD_DIR=./uploads
DEMO_ENV=true
```

## Demo accounts

Every demo account uses password `Demo@12345`.

| Email | Role |
| --- | --- |
| citizen@demo.in | Citizen |
| gov@demo.in | Government / Panchayat-ULB |
| uniadmin@demo.in | University Admin |
| faculty@demo.in | Faculty / Mentor |
| student@demo.in | Student |
| industry@demo.in | Industry / CSR |
| admin@demo.in | System Admin |

## Golden Demo

1. Sign in as `citizen@demo.in` and submit the irrigation-voltage scenario using the five-step wizard.
2. Sign in as `gov@demo.in`; validate the challenge, cluster related reports, generate recommendations, and approve a university match.
3. Sign in as `uniadmin@demo.in`; accept the match, create the project, add the student and mentor, and assign a task.
4. Sign in as `student@demo.in`; move the task to review and submit IRL evidence.
5. Sign in as `faculty@demo.in`; approve that IRL evidence.
6. Sign in as `industry@demo.in`; create a support offer. Offers do not imply guaranteed funding.
7. Return as University Admin to advance the allowed lifecycle stage and record predicted impact.
8. Government dashboard values update directly from the database.

`admin@demo.in` can use **Reset Golden Demo**. It resets the predefined irrigation workflow while retaining unrelated records and related similarity reports.

## API highlights

- `/api/auth`: registration, login, current user, demo accounts.
- `/api/challenges`: reports, evidence uploads, analysis, duplicate review, validation, comments, and map GeoJSON.
- `/api/clusters`: systemic clusters and explainable university matching.
- `/api/projects`: team, mentor, tasks, IRL evidence/reviews, lifecycle, prototypes, testing, offers, pilots, impact, and threaded messages.
- `/api/admin`: users, configurable settings, audit log, and Golden Demo reset.

## Verified checks

- Frontend production build (`npm run build --prefix frontend`)
- Backend migration and seed on fresh PGlite
- Shared-record Golden Demo API flow: citizen → AI → government → university → student → faculty → industry → lifecycle → impact → dashboard
- Admin-only Golden Demo reset

## Deployment notes and limitations

For deployment, use managed PostgreSQL, a strong rotated `JWT_SECRET`, HTTPS/reverse proxy, persistent object storage for uploads, and a live `AIProvider` adapter. Demo AI results and data must remain visibly labelled. PGlite is intended only for local/demo fallback; do not run multiple API processes against the same PGlite directory.
