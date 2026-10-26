# Naukri Suvidha — Naukri Suvidha

An AI-assisted campus placement portal. Students upload a résumé once, an LLM turns it
into a structured profile, and every job they see is ranked by how well they actually fit
it. Recruiters post jobs behind an admin approval gate and work a shortlist sorted by the
same score. Admins run the whole placement cycle and watch it on a live dashboard.

**Status:** Phase 6 of 7 complete — the portal is feature-complete: live notifications,
interview scheduling and placement analytics. Only hardening and deployment remain.

---

## What problem it solves

Campus placement today runs on spreadsheets, WhatsApp groups and notice boards. Three
things break repeatedly:

| Problem | What Naukri Suvidha does |
| --- | --- |
| Students apply to jobs they are not eligible for | Eligibility is a rule on the job, checked by the server before an application is written |
| Recruiters read hundreds of résumés by hand | Every résumé is parsed once and scored against the job, with reasoning attached |
| Nobody knows the real placement numbers until the cycle ends | Every status change is an event; the admin dashboard reads live counts |

The end-to-end flow: a student registers, uploads a résumé, and the AI layer extracts a
profile from it. A recruiter posts a job; an admin approves it; only then is it visible.
The student sees that job ranked by fit, applies, and the recruiter moves them through a
status pipeline that the student can watch in real time.

## Architecture in one paragraph

One React SPA, **two Express services behind an API gateway**, and MongoDB. Nine
modules live inside the API process with their own routes, collections and domain
events; **authentication is a separate service** with its own image, its own
lifecycle and its own database. The service boundaries from the design are real, and
one of them is now a network boundary rather than a module boundary — which is what
makes the cost of the rest of them measurable rather than theoretical.

The edge is the only way in. It serves the built SPA, routes `/api/auth` to the auth
service and the rest of `/api` to the API, and **authenticates every API request on
the way through**: an nginx `auth_request` subrequest asks the auth service to
introspect the bearer token, and the identity it returns is forwarded to the API. So
the API verifies no token and reads no user — that happened once, at the edge, in the
service that owns the data.

The model never runs inside a request: résumé extraction and fit scoring are queued
and handled by an in-process worker, so a slow LLM call can never hold a user's
request open.

```
                        ┌─── edge (nginx) ─ static host · router · load balancer · gateway
React 19 SPA ─HTTPS/wss─┤
                        │   /api/auth/* ──▶  auth service    ──▶  naukri_suvidha_auth
                        │   /api/*      ──▶  API ×N          ──▶  naukri_suvidha
                        │   /socket.io  ──▶  API                  ──▶  object store
                        └                                         ──▶  LLM provider

every /api/* request:   edge ──auth_request──▶ auth /internal/introspect
                             ──X-Auth-User-{Id,Role}──▶ API
```

Full design, data model, API surface and phase plan: **[project plan][plan]**.
The written report: **[project report][report]**.

[plan]: https://claude.ai/code/artifact/9e031f77-7e4b-442b-9edb-d85c7c00c803
[report]: https://claude.ai/code/artifact/9ee5f933-efa2-40ac-9d36-a7f69079a76d

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, Tailwind, React Router, TanStack Query |
| Backend | Node 22, Express 5, Mongoose 8 |
| Database | MongoDB Atlas |
| Auth | A separate service: JWT access tokens + httpOnly refresh cookie, bcrypt |
| Gateway | nginx — routing, load balancing and `auth_request` authentication |
| Infrastructure | Docker Compose and Kubernetes (kind), Redis, Kafka — all running, not described |
| Realtime | Socket.IO |
| AI | Ollama (`llama3.1:8b`) in dev, Claude in production, behind one `LLMProvider` |
| Validation | Zod, shared between client and server |

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation — scaffold, 11 schemas, seed data, infra interfaces | ✅ done |
| 2 | Auth, RBAC, React shell | ✅ done |
| 3 | Profiles, jobs, admin approval gate | ✅ done |
| 4 | Résumés, extraction, applying | ✅ done |
| 5 | The AI layer — provider, worker, fit scoring | ✅ done |
| 6 | Realtime, interviews, analytics | ✅ done |
| 7 | Harden, deploy, document | 🟡 in progress |

All nine infrastructure concepts the course requires now run rather than being
designed: load balancing, Redis, Kafka, Kubernetes, an API gateway, microservices,
Docker, a CDN-standing-in edge, and horizontal scaling.

## Repository layout

```
naukri-suvidha/
  server/src/         the API: nine domain modules in one process
    modules/        one folder per domain module, plus internal/ for the
                    two routes the auth service calls back on
    infra/          storage, llm, events, cache, identity - interfaces +
                    implementations
    middleware/     requestId, error, auth, rbac
    config/         env loading and validation
  services/
    auth/           the extracted auth service: its own package, image,
                    Dockerfile, test suite and database
  service-kit/src/    plumbing BOTH services must agree on - the token
                    functions, the one error shape, the dotenv rules, the
                    Redis connection. Only things that would be a *bug* to
                    duplicate, not merely inconvenient.
  client/src/
    pages/          auth, student, recruiter, admin
    api/            one TanStack Query hook file per module
    context/        auth session
    layouts/        the signed-in shell
    components/  hooks/  lib/
  shared/src/       Zod schemas and constants used by BOTH sides
  infra/
    nginx/          the compose edge's gateway config
    k8s/            the Kubernetes manifests, and the edge's config for them
  docs/             notes that are not the plan
```

## Running the checks

```bash
npm run lint       # eslint across every workspace
npm test           # 157 tests over two suites, against a real mongod
npm run test:api   # the API's 129 alone
npm run test:auth  # the auth service's 28 alone
npm run docs:check # 72 claims the design document makes about this repo
npm run build --workspace=client
```

Each service has its own suite and its own throwaway database, so the two can run at
the same time without either wiping the other's rows — which is the boundary doing
its job.

Both suites need a local MongoDB and **refuse to run unless the database name
contains "test"** — they delete every collection between tests, and one destroyed a
development database once before that guard existed. Their configuration is
`server/.env.test` and `services/auth/.env.test`, committed on purpose so CI needs no
secrets. The guard itself lives in `service-kit`, so a third service cannot
accidentally reintroduce the bug.

GitHub Actions runs all three on every push, plus
`npm audit --omit=dev --audit-level=high`.

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)**. Short version: Vercel for the client,
Render for the API, Atlas for the database, and an S3-compatible bucket for
résumés — Render's disk is ephemeral, so local storage would lose every upload
on the next deploy.

**[DEMO.md](DEMO.md)** is the eight-minute demo script, including the run with
the model switched off.

## Getting started

```bash
npm install
cp server/.env.example      server/.env        # MONGODB_URI and the secrets
cp services/auth/.env.example services/auth/.env
npm run seed -- --fresh     # 3 admins, 6 companies, 40 students, 12 jobs
npm run dev                 # client :5173, API :5001, auth :5002
```

Two env files, because there are two services. **The JWT secrets must be byte-identical
in both** — the auth service mints the access tokens the API verifies, and a mismatch is
a sign-in that appears to work and is then refused everywhere.

Seeding writes **both** databases in one run, and it has to: a student profile carries a
`userId`, so the users have to exist in the auth service's database and their ids have to
match. There is no ordering of two separate scripts that produces that. The `seed` script
sets `AUTH_MONGODB_URI` for you; override it if your auth database is elsewhere.

The API listens on **5001**, not 5000: on macOS, port 5000 is held by the AirPlay
Receiver in Control Center, which answers requests with a bare `403`. The auth service is
on 5002. Change `PORT` in either `.env` if you need different ones.

Each service reads its `.env` from its own package directory regardless of where you
start the process from. If a required variable is missing the service refuses to start and
prints exactly which ones.

There is no gateway in this mode — Vite's dev proxy does the routing instead, sending
`/api/auth` to 5002 and the rest of `/api` to 5001. To see the real gateway, run one of
the container stacks: `npm run docker:up` (`:8080`) or `npm run k8s:up` (`:8081`).

## Still to do by hand

Three Phase 1 items need a person, not a commit:

- [ ] Install Ollama and pull `llama3.1:8b`, then confirm it returns valid JSON. Phase 5
      needs it; nothing before then does.
- [ ] Collect 20 real résumés as PDFs into `server/test/fixtures/`. They are the only
      honest test of extraction, and the directory is gitignored because they are personal
      data.
- [ ] Sketch the five main screens on paper before Phase 2 starts.

## How eligibility works

Whether a student may apply to a job is decided by **one pure function** in
`shared/src/eligibility.js`, with no database and no imports from either side. The server
enforces it; the client calls the same function to explain a greyed-out job without a
round trip. There is one copy of the rules, which is the point — a rule that exists twice
eventually disagrees with itself.

It checks four things: CGPA, active backlogs, branch (an empty `allowedBranches` means
every branch), and the deadline.

Because fetching every job and filtering in memory does not scale, the same rules are also
expressed as a MongoDB filter. The two **must** agree, so a check runs both over the same
data and compares the results.

Students see jobs they are not eligible for, with the reason spelled out — "Open to CSE,
IT; you are in CIVIL" — rather than a shorter list they cannot explain.

## How the approval gate works

A job is created `pending` and is invisible to students until an admin approves it. A
student asking for an unapproved job by id gets `404`, not `403`, so the response does not
confirm that it exists.

Changing `minCgpa`, `maxBacklogs` or `allowedBranches` on an already-approved job sends it
back to the queue. Without that, a recruiter could be approved on easy terms and then
tighten them, and the gate would be decorative. Editing a description or deadline does not
re-queue.

## How realtime works

Socket.IO shares the HTTP server, so there is one process and one port to deploy. A socket
authenticates exactly as a request does — the access token is verified and the user
re-checked against the database — so a suspended account or an ended session cannot hold
an open channel. Each connection joins exactly one room, its own, which is what stops one
student subscribing to another's events.

Screens know nothing about sockets. A push invalidates the relevant queries and TanStack
Query refetches, so there is one source of truth for the data and every screen behaves the
same whether the socket is up or not.

Notifications are **written first and pushed second**. The row is what matters; the emit
is a nicety. Someone with no tab open still finds it in their inbox, and a failed
notification never fails the thing it was describing.

Measured: a recruiter status change reaches an open student tab in **10ms**.

## Semantic resume search (prototype)

Retrieval is used where it earns its place and nowhere else. Extraction reads one
document and scoring compares one pair — both fit in context, so neither needs it.
Searching several hundred résumés does, because exact skill matching misses a candidate
whose résumé says "event streaming" when the recruiter asks for message queues.

```bash
ollama pull nomic-embed-text   # 768-dimension vectors, ~274 MB
npm run seed:resumes           # ten varied résumés, embedded
```

`GET /api/resumes/search?q=…` — four queries with **no literal keyword overlap**, each
returning the right student first:

| Query | Top result |
| --- | --- |
| "built event-driven backends with message queues" | Kafka, Spring Boot |
| "make the interface accessible and fast" | React, Tailwind, Accessibility |
| "experience shipping to app stores" | Flutter, Dart, Kotlin |
| "wrote firmware for microcontrollers" | C, FreeRTOS, STM32 |

**It does not widen who may read a résumé.** The corpus is narrowed in the database filter
*before* ranking: an admin searches every student, a recruiter only students who applied
to one of their own jobs, a student not at all. The same query returns 11 results for the
placement office and 1 for a recruiter.

`VECTOR_INDEX=memory` is a linear scan in process — a few hundred vectors of 768 floats is
well under a millisecond, and the database round trip dominates (measured 2–6ms end to
end). `VECTOR_INDEX=atlas` switches to `$vectorSearch`, which needs a search index defined
on Atlas and is the untested path here.

## How the AI layer works

**The model never runs inside a request.** Work is written to `aiTasks` first, then handed
to an in-process queue at concurrency 2. The database row is the durable part — the queue
is lost on restart, so anything stranded mid-run is reclaimed on boot. Claiming a task is
an atomic `findOneAndUpdate`, so a recovered task cannot run twice. A task that exhausts
its attempts lands in `dead` instead of cycling forever.

**Every answer is validated.** Extraction and scoring both parse the model's JSON against
a Zod schema. On a violation the model gets **one repair attempt**, shown its own output
and what was wrong with it. A second failure falls back rather than failing the upload.

**The fallbacks are deliberately dumb** — regexes and set arithmetic, no inference. They
exist so an examiner can stop Ollama mid-demo and the portal keeps ranking. Everything
they produce is **capped at 70 and flagged in the UI**, so a guess can never outrank
something the model actually reasoned about.

Swapping Ollama for Claude is one environment variable. `GET /api/ai/health` reports the
provider, the queue depth, task counts and what degraded behaviour is in effect.

Measured locally on `qwen2.5-coder:7b`: extraction ~10s, scoring ~4s each.

## How uploads are checked

A filename extension and a `Content-Type` are both supplied by whoever is uploading, so
neither is evidence. Every upload is identified by its **leading bytes** — `%PDF` for a
PDF, and for a DOCX the zip header plus an actual `word/` entry, because every `.jar` and
`.xlsx` starts with the same four bytes.

Files are held in memory until they pass, then stored under a random UUID key that is
never derived from the filename, so a crafted name cannot traverse out of the upload
directory. If the database row fails to write, the stored file is deleted again rather
than left orphaned.

Extraction never throws. A résumé that cannot be read is flagged on the record and the
upload still succeeds — and a file that yields under 50 characters is reported as a
probable scan instead of silently storing an empty string.

Run `npm run resumes:check` to push everything in `server/test/fixtures/` through the real
extraction path and see what fails.

## How applying works

Eligibility is re-checked at the moment of writing, not just when the list was drawn, so a
stale page or a direct API call cannot skip it.

Deduplication is the unique `(jobId, studentId)` index rather than a read-then-write, so
two simultaneous clicks cannot both succeed.

Every status change appends to `timeline[]` with the actor and the time. Transitions are
validated from a single map in `shared/`, which the recruiter UI also reads to decide
which buttons to show — so a stage cannot be skipped, and a rejection or an offer cannot
be quietly reversed.

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

### Where the checking happens

All of the above is the **auth service's** now, and so is the `users` collection. The API
has no connection that can read it. That moves one question: who decides a request is
allowed?

In both container stacks, the **edge** does, once per request. nginx runs an
`auth_request` subrequest against the auth service's introspection endpoint, which
verifies the signature *and* re-reads the row — because a token that has not expired is
not the same thing as a session that is still allowed. The identity comes back in
response headers, and the edge forwards it to the API.

Trusting a header is the sharp edge of that design, so it has two locks. nginx sets all
four identity headers on **every** proxied request, including empty on the unauthenticated
ones, so a client's own values are always overwritten; and the API additionally requires a
shared secret, so being able to reach it is not enough. Be precise about the limit: that
secret is a bearer secret shared between three processes, **not** a per-request proof, so
anything holding it and a route to the API could mint any identity. A short-lived signed
assertion — what Envoy's `ext_authz` and ALB's `X-Amzn-Oidc-Data` carry — removes that,
and is the upgrade path rather than something already built.

Running the API alone, as `npm run dev` and the test suite do, there is no edge to do any
of this, so it verifies the token itself and trusts the claims. The cost of that mode is
exact and worth stating: **no revocation check**, so a suspended account keeps access
until its access token expires. That is why it is the development mode and the gateway is
the deployed one.

Route guards in React are a convenience for the person using the app, **not** a security
boundary. Every rule they express is enforced again on the server, which is the only place
that counts.

## Build log

Newest first. Every entry is one pushed commit.

### 2026-10-20 — Phase 7
Hardening and release preparation. 72 tests, a security pass, S3-compatible storage, CI,
deployment configuration and the written report. Deployment itself, the production seed
and the demo rehearsal need accounts and a person — `DEPLOYMENT.md` and `DEMO.md` cover
both.

### 2026-10-20 — Phase 6 complete
- **Realtime.** Socket.IO on the same server, token-authenticated, per-user rooms, three
  events. Status change to open tab measured at **10ms** against a one-second requirement.
- **Notifications.** Consumers for every domain event in one file, an inbox with unread
  counts, and a live/reconnecting indicator.
- **Interviews.** Schedule, reschedule and cancel, gated on the pipeline so only a
  shortlisted applicant can be booked. Validation refuses an online interview with no link
  or an onsite one with no location.
- **Analytics.** Placement rate, offers, median CTC, upcoming interviews, an eight-week
  trend and a stage breakdown — plus the audit log and AI-layer health.
- **Chart colours were computed, not chosen.** The two categorical hues separate by ΔE
  29.6 under protanopia (target 8). One axis, legend for two series, direct labels for the
  single-series chart, 2px surface rings so coinciding points stay legible.
- **Fixed the Vite proxy**, which only covered `/api` — the `/socket.io` handshake never
  reached the server, so realtime silently failed in development.
- **Code-split the analytics page.** Recharts pushed the bundle past 500 kB for everyone;
  only the placement office now downloads those 382 kB.

### 2026-10-20 — Phase 5 complete
- **Both providers implemented.** Ollama via its JSON mode, Claude via the Anthropic SDK —
  which checks `stop_reason` for a refusal or token cutoff before reading content, because
  neither raises.
- **The queue.** `aiTasks` + `p-queue` at concurrency 2, with backoff retries, a dead
  state, and recovery of stranded tasks on boot.
- **Extraction and scoring**, each with Zod validation, one repair retry, and a
  deterministic fallback.
- **Ranked lists.** Students see jobs best-fit-first; recruiters see applicants the same
  way. Both show the breakdown and the model's reasoning.
- **Verified by killing the model mid-run:** health went `degraded`, scoring continued,
  and every score came back ≤70, flagged, and still correctly ordered.
- **Corrected `ANTHROPIC_MODEL` to `claude-opus-5`.** The earlier value was a cheaper
  model picked without being asked for.

### 2026-10-20 — Phase 4 complete
- **Résumés.** Upload with drag-and-drop, magic-byte validation, a 5 MB cap, versioning,
  and text extraction via `pdf-parse` and `mammoth`. Files are readable by the student who
  owns one, an admin, or a recruiter at a company that student actually applied to.
- **Applying.** Eligibility enforced again at write time, deduplication by unique index,
  and a résumé required before applying.
- **The pipeline.** Applied → shortlisted → interview → offered, with rejection available
  throughout and withdrawal available to the student until an offer exists. An offer marks
  the student placed.
- **Screens.** The student résumé page and application tracker with its timeline, and the
  recruiter applicant list with the résumé attached and only the valid next actions shown.
- **Fixed `AppError.forbidden` and friends**, which accepted only a message and silently
  dropped their `details` argument — so a student refused for eligibility was told "you
  are not eligible" with no indication of why.
- **Fixed `seed --fresh`,** which cleared only four of the eleven collections and left
  résumés and applications pointing at students who no longer existed.

### 2026-10-20 — Iron filings behind the auth screens
Login and register now sit on a translucent card over the same field, via a shared
`AuthLayout`. The magnet follows the cursor everywhere.

The component originally bundled five behaviours into one `interactive` flag: following
the pointer, a crosshair cursor, a tab stop on the wrapper, click-to-drop-a-magnet, and
`touch-none`. Behind a form you want the first and none of the rest — a crosshair over a
text box is wrong, a tab stop ahead of the email field is worse, and `touch-none` would
have left the register form taller than a phone screen with no way to scroll it.

So `followPointer` and `pointerSource` are now separate props. Pointer tracking on the
auth screens listens on the **window**, because the field sits behind the card and pointer
events over the form never reach it. The landing page tracks globally too, so the magnet
keeps following over the buttons.

### 2026-10-20 — Landing page (experimental)
A signed-out front door at `/`, built around the `IronFilings` canvas component from
21st.dev. Signed-in users still redirect straight to their dashboard, so nothing about the
app itself changed.

The component needed converting: it ships as TypeScript against shadcn conventions, and
this project is plain JSX with its own tokens. It was rewritten as `.jsx` and the demo's
`bg-background` / `text-muted-foreground` were mapped onto `bg-surface` / `text-muted`. It
has no dependencies beyond React and draws to a canvas, so nothing was installed.

It lives in `client/src/components/ui/`, which is the folder every 21st.dev component
imports against — keeping that path means the next one needs less rewiring.

**This is a self-contained experiment.** Reverting it is one commit: delete
`client/src/pages/Landing.jsx` and `client/src/components/ui/`, and point `/` back at a
redirect in `App.jsx`.

### 2026-10-20 — Phase 3 complete
- **Profiles.** Students and companies read and edit their own profile. A student's CGPA,
  backlogs and branch drive eligibility, so saving the form re-checks which jobs they
  qualify for.
- **Jobs.** Create, list, read, update, approve, reject and close, each gated by role and
  by ownership — a recruiter touching another company's posting gets `403`.
- **The approval gate.** Nothing a recruiter posts reaches students until the placement
  office approves it, and tightening eligibility after approval sends it back.
- **Eligibility as one pure function**, with a matching database filter and a check that
  the two agree.
- **Screens.** The student job list with per-job eligibility reasons and an "eligible
  only" toggle, the recruiter's postings with a post-a-job form, and the admin approval
  queue with reject-and-explain.
- `job.created` and `job.approved` are published on the event bus. Nothing consumes them
  yet; Phase 6 will.
- **Fixed `npm run seed -- --fresh`,** which the README documented but which silently
  dropped its flag — npm does not forward arguments through a nested workspace script, so
  the command always refused to run.

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

- **A gateway error page crashed the error handler.** The client assumed every response
  was JSON. Render and Vercel return an HTML page for a 502 or a cold-start timeout, so
  the user would have seen `Unexpected token '<'` instead of a usable message. Unparseable
  bodies now become a plain "the server is not responding properly".

Also added the `docs/` and `server/test/fixtures/` directories to the repository. Git does
not track empty directories, so the README was describing two folders a fresh clone did
not have.

### 2026-10-19 — Phase 2 complete
- **Readable dev logs.** `pino-http` logs every request and response header by default,
  which buried anything useful under a screen of noise per request. Requests are now one
  line — `POST /api/auth/login 200` — with 4xx logged as a warning and only 5xx as an
  error with a stack. The path comes from `originalUrl`, because Express rewrites
  `req.url` to the router-relative path and the log would otherwise read `/login`.
- **Shared validation.** A third workspace, `@naukri-suvidha/shared`, holds the Zod schemas and the
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
