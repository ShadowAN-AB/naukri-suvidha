# Naukri Suvidha — Nexus

An AI-assisted campus placement portal. Students upload a résumé once, an LLM turns it
into a structured profile, and every job they see is ranked by how well they actually fit
it. Recruiters post jobs behind an admin approval gate and work a shortlist sorted by the
same score. Admins run the whole placement cycle and watch it on a live dashboard.

**Status:** Phase 2 of 7 complete — you can register, sign in, and land on your own
dashboard. Nothing is deployed yet.

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
| 1 | Foundation — scaffold, 11 schemas, seed data, infra interfaces | ✅ done |
| 2 | Auth, RBAC, React shell | ✅ done |
| 3 | Profiles, jobs, admin approval gate | 🟡 next |
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
    context/        auth session
    layouts/        the signed-in shell
    components/  hooks/  lib/
  shared/src/       Zod schemas and constants used by BOTH sides
  docs/             notes that are not the plan
```

## Getting started

```bash
npm install
cp server/.env.example server/.env   # then fill in MONGODB_URI and the secrets
npm run seed -- --fresh              # 3 admins, 6 companies, 40 students, 12 jobs
npm run dev                          # client on :5173, server on :5001
```

The server listens on **5001**, not 5000: on macOS, port 5000 is held by the AirPlay
Receiver in Control Center, which answers requests with a bare `403`. Change `PORT` in
`server/.env` if you need a different one.

`.env` is read from `server/.env` regardless of which directory you start the process
from. If a required variable is missing the server refuses to start and prints exactly
which ones.

## Still to do by hand

Three Phase 1 items need a person, not a commit:

- [ ] Install Ollama and pull `llama3.1:8b`, then confirm it returns valid JSON. Phase 5
      needs it; nothing before then does.
- [ ] Collect 20 real résumés as PDFs into `server/test/fixtures/`. They are the only
      honest test of extraction, and the directory is gitignored because they are personal
      data.
- [ ] Sketch the five main screens on paper before Phase 2 starts.

## How authentication works

Two tokens, with different jobs:

- The **access token** is a 15-minute JWT the client keeps *in memory only*. It is never
  written to `localStorage`, so a script injected into the page cannot steal a credential
  that outlives the tab.
- The **refresh token** is a 7-day JWT in an `httpOnly` cookie scoped to `/api/auth`.
  JavaScript cannot read it, and the browser does not attach it to any other request.

A reload loses the access token but keeps the cookie, so the app exchanges it for a new
access token once on start-up. When any request comes back `401`, the same exchange runs
and the original request is retried once; concurrent `401`s share a single refresh rather
than each firing their own.

Both tokens carry a `tokenVersion`. Bumping that column on a user invalidates every token
already issued to them, which is how suspension and "sign out everywhere" work without
storing a session table.

Route guards in React are a convenience for the person using the app, **not** a security
boundary. Every rule they express is enforced again on the server, which is the only place
that counts.

## Build log

Newest first. Every entry is one pushed commit.

### 2026-10-20 — Verification pass over phases 1 and 2
Re-checked everything from a clean clone of the published repository, following the
README's own setup steps against a separate database. 24 endpoint and security checks
pass. Two real bugs were found and fixed:

- **The login timing defence did not work.** The placeholder hash compared against for an
  unknown email was 52 characters where bcrypt needs 53, so it was rejected as malformed
  and returned in microseconds instead of doing the work. An unknown email answered about
  84,000x faster than a real one, which is precisely the user-enumeration oracle the code
  claimed to close. It now compares against a genuine hash computed once at start-up;
  measured, the two cases are 225ms and 218ms.
- **Ten typos locked you out of registering.** The hourly registration limit counted
  rejected submissions, so a few mistakes on the form — a short password, a roll number
  already taken — burned the whole budget. It now counts only accounts actually created,
  and the limit is raised because a campus shares one public IP.

Also added the `docs/` and `server/test/fixtures/` directories to the repository. Git does
not track empty directories, so the README was describing two folders a fresh clone did
not have.

### 2026-10-19 — Phase 2 complete
- **Readable dev logs.** `pino-http` logs every request and response header by default,
  which buried anything useful under a screen of noise per request. Requests are now one
  line — `POST /api/auth/login 200` — with 4xx logged as a warning and only 5xx as an
  error with a stack. The path comes from `originalUrl`, because Express rewrites
  `req.url` to the router-relative path and the log would otherwise read `/login`.
- **Shared validation.** A third workspace, `@nexus/shared`, holds the Zod schemas and the
  role constants. The register form and the register endpoint validate against the same
  object, so the two cannot drift apart.
- **Auth module.** Register, login, refresh, logout and me, with bcrypt at cost 12. Login
  runs a bcrypt comparison even when the email is unknown, so response time does not
  reveal which accounts exist, and every attempt — success or failure — is written to
  `auditLogs`.
- **RBAC.** `requireRole` gates an admin-only endpoint, so the middleware is exercised by
  a real route rather than sitting unused until Phase 6.
- **Rate limiting.** Login allows five attempts a minute per IP, and successful sign-ins
  do not count against the budget, so nobody is locked out by their own activity.
- **React shell.** Auth context, protected routes, a role-aware layout, login and register
  screens, and the three dashboards. A student who types `/dashboard/admin` is sent back
  to their own dashboard; the same request to the API returns `403`.

### 2026-10-19 — Phase 1 complete
- **Client scaffold.** Vite 6, React 19, Tailwind 4, React Router 7 and TanStack Query,
  with `/api` proxied to the server so the client never learns the API's origin. One
  `api()` helper does every fetch and turns a failure into an `ApiError` carrying the
  server's code and request id, so a message on screen can be matched to a line in the
  logs. The one page, `SystemStatus`, reports API and database health — it exists to prove
  the stack is wired, and Phase 2 replaces it with the real shell.
- **Fixed a port collision.** A `PORT` exported by a parent process silently overrode
  `.env` and made the API bind to Vite's port. `.env` now takes precedence locally, while
  the hosting platform's own `PORT` still applies in production, where no `.env` exists.
- `npm run dev` starts both halves; verified in a browser with the API reporting `ok` and
  the database `up`.

### 2026-10-19 — Phase 1 begins
- **Seed data.** `npm run seed` builds a demo placement cycle: 3 admins, 6 companies,
  40 students across 6 branches, and 12 jobs (8 approved, 3 awaiting approval, 1 closed).
  The generator is deterministic, so a demo script written today still works next week. It
  refuses to run against a non-empty database unless given `--fresh`.
- **The four infrastructure seams.** `StorageProvider`, `LLMProvider`, `EventBus` and
  `Cache` now exist as interfaces with the development implementation behind each one.
  Storage keys are random UUIDs and never derived from the uploaded filename, and any key
  that resolves outside the upload root is refused. The event bus isolates subscribers, so
  a handler that throws is logged without taking down the publisher or its siblings. The
  Ollama and Claude providers are stubs that fail with the phase they land in.
- **The data model.** All eleven collections written as Mongoose schemas, each owned by the
  module that uses it, with every index from the plan verified against a live database:
  `users` `students` `companies` `jobs` `applications` `resumes` `fitScores` `aiTasks`
  `interviews` `notifications` `auditLogs`. The unique `(jobId, studentId)` index is what
  makes duplicate applications impossible — deduplication is the database's job, not the
  service's. Domain enums and event names live in one shared constants file.
- **Server foundation.** Express 5 app with helmet, CORS, a 300/min API rate-limit floor,
  pino request logging, and a `GET /api/health` that reports database state. Every request
  carries an `x-request-id` that appears in both the logs and any error body.
- **Config that fails loudly.** `server/src/config/env.js` validates the whole environment
  with Zod at boot and exits with the list of what is missing. Paths resolve against the
  server package, not the shell's cwd.
- **Error handling.** One `AppError` type plus a handler that hides 500 details in
  production and always returns `{ error: { code, message, requestId } }`.
- Dropped `nodemon` in favour of Node 22's native `--watch`; the dependency tree is now at
  zero known vulnerabilities.
- Repository initialised, workspace layout created, README started.

---

*This README is maintained as the build progresses. The authoritative design document is
the [project plan][plan].*
