# Naukri Suvidha — Nexus

An AI-assisted campus placement portal. Students upload a résumé once, an LLM turns it
into a structured profile, and every job they see is ranked by how well they actually fit
it. Recruiters post jobs behind an admin approval gate and work a shortlist sorted by the
same score. Admins run the whole placement cycle and watch it on a live dashboard.

**Status:** Phase 1 of 7 — foundation. Nothing is deployed yet.

---

## What problem it solves

Campus placement today runs on spreadsheets, WhatsApp groups and notice boards. Three
things break repeatedly:

| Problem | What Nexus does |
| --- | --- |
| Students apply to jobs they are not eligible for | Eligibility is a rule on the job, checked by the server before an application is written |
| Recruiters read hundreds of résumés by hand | Every résumé is parsed once and scored against the job, with reasoning attached |
| Nobody knows the real placement numbers until the cycle ends | Every status change is an event; the admin dashboard reads live counts |

The end-to-end flow: a student registers, uploads a résumé, and the AI layer extracts a
profile from it. A recruiter posts a job; an admin approves it; only then is it visible.
The student sees that job ranked by fit, applies, and the recruiter moves them through a
status pipeline that the student can watch in real time.

## Architecture in one paragraph

One React SPA, one Express process, one MongoDB. Ten modules live inside that single
process with their own routes, collections and domain events — the service boundaries
from the design are real, but they are module boundaries, not network boundaries. The
model never runs inside a request: résumé extraction and fit scoring are queued and
handled by an in-process worker, so a slow LLM call can never hold a user's request open.

```
React 19 SPA  ──HTTPS/wss──▶  Express 5 (10 modules + aiWorker)  ──▶  MongoDB Atlas
                                                                 ──▶  Object store
                                                                 ──▶  LLM provider
```

Full design, data model, API surface and phase plan: **[project plan][plan]**.

[plan]: https://claude.ai/code/artifact/9e031f77-7e4b-442b-9edb-d85c7c00c803

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, Tailwind, React Router, TanStack Query |
| Backend | Node 22, Express 5, Mongoose 8 |
| Database | MongoDB Atlas |
| Auth | JWT access tokens + httpOnly refresh cookie, bcrypt |
| Realtime | Socket.IO |
| AI | Ollama (`llama3.1:8b`) in dev, Claude in production, behind one `LLMProvider` |
| Validation | Zod, shared between client and server |

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation — scaffold, 11 schemas, seed data, infra interfaces | 🟡 in progress |
| 2 | Auth, RBAC, React shell | ⬜ not started |
| 3 | Profiles, jobs, admin approval gate | ⬜ not started |
| 4 | Résumés, extraction, applying | ⬜ not started |
| 5 | The AI layer — provider, worker, fit scoring | ⬜ not started |
| 6 | Realtime, interviews, analytics | ⬜ not started |
| 7 | Harden, deploy, document | ⬜ not started |

## Repository layout

```
naukri-suvidha/
  server/src/
    modules/        one folder per domain module
    infra/          storage, llm, events, cache - interfaces + implementations
    middleware/     requestId, error, auth, rbac, rateLimit
    config/         env loading and validation
  client/src/
    pages/          auth, student, recruiter, admin
    api/            one TanStack Query hook file per module
    components/  hooks/  lib/
  docs/             notes that are not the plan
```

## Getting started

```bash
npm install
cp server/.env.example server/.env   # then fill in MONGODB_URI and the secrets
npm run dev                          # client on :5173, server on :5000
```

## Build log

Newest first. Every entry is one pushed commit.

### 2026-10-19 — Phase 1 begins
- Repository initialised, workspace layout created, README started.

---

*This README is maintained as the build progresses. The authoritative design document is
the [project plan][plan].*
