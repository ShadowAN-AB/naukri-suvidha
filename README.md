# Naukri Suvidha

An AI-assisted campus placement portal. Students upload a résumé once, an LLM
turns it into a structured profile, and every job they see is ranked by how
well they actually fit it. Recruiters post jobs behind an admin approval gate
and work a shortlist sorted by the same score. Admins run the whole placement
cycle and watch it on a live dashboard.

**Status:** Phase 7 of 7 — the portal is feature-complete. All nine
infrastructure concepts the course requires run rather than being designed:
load balancing, Redis, Kafka, Kubernetes, API gateway, microservices, Docker,
a CDN-standing-in edge, and horizontal scaling.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick start — development mode](#quick-start--development-mode)
5. [Running it as Docker containers](#running-it-as-docker-containers)
6. [Running it on Kubernetes](#running-it-on-kubernetes)
7. [Setting up Ollama (the LLM)](#setting-up-ollama-the-llm)
8. [Seeding the databases](#seeding-the-databases)
9. [Running the tests](#running-the-tests)
10. [Repository layout](#repository-layout)
11. [Environment variables](#environment-variables)
12. [Troubleshooting](#troubleshooting)
13. [Deploying](#deploying)
14. [How things work](#how-things-work)

---

## What it does

Campus placement today runs on spreadsheets, WhatsApp groups and notice
boards. Three things break repeatedly:

| Problem | What Naukri Suvidha does |
| --- | --- |
| Students apply to jobs they are not eligible for | Eligibility is a rule on the job, checked by the server before an application is written |
| Recruiters read hundreds of résumés by hand | Every résumé is parsed once and scored against each job, with reasoning attached |
| Nobody knows the real placement numbers until the cycle ends | Every status change is an event; the admin dashboard reads live counts |

End-to-end flow: a student registers, uploads a résumé, the AI extracts a
structured profile. A recruiter posts a job; an admin approves it; only then
is it visible. The student sees jobs ranked by fit, applies, and the recruiter
moves them through a status pipeline the student watches in real time. When
an interview is scheduled, the email service sends the invite.

## Architecture

One React SPA, **five Node services behind an nginx API gateway**, and
MongoDB. Seven modules live inside the API process; auth, notifications,
realtime, and email are each their own service with their own image, lifecycle
and database.

```
                        ┌─── edge (nginx) ─ static host · router · load balancer · gateway
React 19 SPA ─HTTPS/wss─┤
                        │   /api/auth/*          ──▶ auth      ──▶ naukri_suvidha_auth
                        │   /api/*               ──▶ API ×N    ──▶ naukri_suvidha
                        │   /socket.io           ──▶ realtime  (no db)
                        └                                      ──▶ Ollama / Claude

every /api/* request:   edge ──auth_request──▶ auth /internal/introspect
                             ──X-Auth-User-{Id,Role}──▶ the upstream

a notification:         API ──commit+outbox──▶ Kafka ──▶ notif    ──▶ naukri_suvidha_notifications
                                                      ──▶ email   ──▶ naukri_suvidha_email ──▶ SMTP
                        notif ──▶ Redis adapter ──▶ realtime ──▶ the student's socket
```

**Five services, four databases:**

| Service | Port (dev) | Database | What it does |
| --- | --- | --- | --- |
| API | 5001 | `naukri_suvidha` | 7 domain modules (jobs, applications, interviews, résumés, admin, AI, profiles) |
| Auth | 5002 | `naukri_suvidha_auth` | Login, JWT minting, users table — the only one that owns credentials |
| Notifications | 5003 | `naukri_suvidha_notifications` | Kafka consumer, writes inbox rows, pushes via Redis |
| Realtime | 5004 | — | Holds every Socket.IO connection; no database of its own |
| Email | 5005 | `naukri_suvidha_email` | Kafka consumer for `interview.scheduled`, sends via SMTP |

**Tech stack:** React 19 + Vite + Tailwind on the client. Node 22 + Express 5
+ Mongoose 8 on the server. MongoDB, Redis, Kafka (KRaft mode), nginx. Zod for
validation (shared client/server). Socket.IO for realtime. Ollama locally,
Claude in production (one `LLMProvider` interface).

---

## Prerequisites

Install these before anything else. Versions matter — Node 22, Docker and
kubectl are the ones most likely to bite you if you install an older one.

### Core (needed for every mode)

| Tool | Version | Install (macOS) |
| --- | --- | --- |
| **Node.js** | ≥ 22.0 | `brew install node@22` then `brew link node@22` |
| **npm** | ≥ 10 | ships with Node |
| **Git** | any recent | `brew install git` |
| **MongoDB Community** | ≥ 7.0 | `brew tap mongodb/brew && brew install mongodb-community@7.0` |

Verify:

```bash
node --version        # v22.x
npm --version         # 10.x or newer
mongod --version      # db version v7.x
```

### For Docker mode

| Tool | Install |
| --- | --- |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ — includes Docker CLI and Compose v2 |

Verify `docker --version` and `docker compose version`.

### For Kubernetes mode

| Tool | Install |
| --- | --- |
| **kind** | `brew install kind` — Kubernetes-in-Docker, used for the local cluster |
| **kubectl** | `brew install kubectl` — CLI |

Verify `kind --version` and `kubectl version --client`.

### For the AI features (optional in dev)

| Tool | Install |
| --- | --- |
| **Ollama** | https://ollama.com/download — needed for résumé extraction and fit scoring |

See [Setting up Ollama](#setting-up-ollama-the-llm) below.

### For the email service (optional in dev)

The email service is a pure Kafka consumer, so without SMTP credentials it
will log sends as `failed` in `EmailLog` and the rest of the portal still
works. To actually send mail you need SMTP credentials — a Gmail app password
is the easiest. Create one at https://myaccount.google.com/apppasswords (needs
2-step verification enabled first).

---

## Quick start — development mode

This is the fastest path. Everything runs on your laptop against a local
MongoDB. No Docker needed.

### 1 · Clone and install

```bash
git clone <this-repo-url> naukri-suvidha
cd naukri-suvidha
npm install
```

This installs every workspace: `shared`, `service-kit`, `server`,
`services/*`, and `client`.

### 2 · Start MongoDB

```bash
brew services start mongodb-community@7.0
```

Verify it is up:

```bash
mongosh --eval 'db.runCommand({ ping: 1 })'
```

### 3 · Copy the env files

Each service reads its `.env` from its own package directory. Copy the
examples:

```bash
cp server/.env.example                    server/.env
cp services/auth/.env.example             services/auth/.env
cp services/notifications/.env.example    services/notifications/.env
cp services/realtime/.env.example         services/realtime/.env
cp services/email/.env.example            services/email/.env
```

The examples work out of the box for development. The one value you'd want to
edit is `services/email/.env`'s `SMTP_USER` and `SMTP_PASS` — set these to
your own Gmail + app password if you want real email sends.

**Security:** every `.env` file is gitignored. Never commit one, never paste
their contents into chat. The JWT secrets must be byte-identical in
`server/.env` and `services/auth/.env` — the examples already match.

### 4 · Seed the databases

```bash
npm run seed -- --fresh
```

Writes 3 admins, 6 companies, 40 students and 12 jobs across the API and auth
databases in one run. Seeded accounts use `@naukrisuvidha.edu` emails with
password `Passw0rd!seed`.

### 5 · (Optional) Start Kafka + Redis for notifications

The notifications and email services need a broker. If you want to see
notifications and emails fire, start them in Docker:

```bash
docker compose up -d kafka redis
```

If you skip this, the API and client still work. Notifications simply won't
appear.

### 6 · Run the stack

```bash
npm run dev
```

This starts six processes with coloured prefixed logs:

| Prefix | Process | URL |
| --- | --- | --- |
| `api` | API server | http://localhost:5001 |
| `auth` | Auth service | http://localhost:5002 |
| `notif` | Notifications service | http://localhost:5003 |
| `rt` | Realtime service | http://localhost:5004 |
| `email` | Email service | http://localhost:5005 |
| `client` | Vite dev server | http://localhost:5173 |

Open **http://localhost:5173** and sign in as a seeded admin:
`tpo@naukrisuvidha.edu` / `Passw0rd!seed`.

There is no gateway in this mode — Vite's dev proxy routes `/api/auth` to
5002, `/socket.io` to 5004, and the rest of `/api` to 5001. To see the real
nginx gateway, use the Docker or Kubernetes stacks below.

---

## Running it as Docker containers

Builds every image and starts the full stack behind the real nginx gateway.
This is the mode that demonstrates load balancing, the gateway, and horizontal
scaling.

### Start it

```bash
npm run docker:up        # builds images and starts six containers
npm run docker:seed      # seeds all four databases (one-shot container)
```

Portal is on **http://localhost:8080**.

### What runs

| Container | What it is | Reachable at |
| --- | --- | --- |
| `edge` | nginx: serves the client, routes `/api`, balances, authenticates | `localhost:8080` |
| `api` ×2 | the API, two replicas | *(not published — go through edge)* |
| `auth` | auth service | *(not published)* |
| `notifications` | notifications service | *(not published)* |
| `realtime` | realtime service (sockets) | *(not published)* |
| `email` | email service | *(not published)* |
| `mongo` | MongoDB 7, replica set `rs0` | `localhost:27018` (27017 kept free for your host mongo) |
| `redis` | cache, rate limits, socket pub/sub | `localhost:6380` |
| `kafka` | KRaft mode, no ZooKeeper | `localhost:9094` from the host, `kafka:9092` inside |

### Scale the API live

```bash
npm run docker:scale     # takes API to 3 replicas without restarting the stack
```

### See the balancing

The edge sets `X-Upstream-Addr` to the replica that answered:

```bash
for i in $(seq 1 10); do
  curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i x-upstream-addr
  sleep 2.5
done
```

### Useful commands

```bash
npm run docker:ps        # what's running
npm run docker:logs      # tail api + edge
npm run docker:down      # stop everything (volumes are kept)
docker compose down -v   # stop AND wipe volumes
```

### Email in Docker mode

The compose stack reads SMTP from the project-root `.env` file (which is
gitignored). To send real email through the container:

```bash
# Create a project-root .env with just the SMTP values
cat > .env <<EOF
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-gmail-app-password
MAIL_FROM="Naukri Suvidha <you@gmail.com>"
DEMO_EMAIL_OVERRIDE=you@gmail.com
EOF

npm run docker:up
```

`DEMO_EMAIL_OVERRIDE` rewrites every outbound recipient to one real inbox so
you can watch the demo without emailing fake seeded students.

---

## Running it on Kubernetes

Three-node kind cluster with the HPA, StatefulSets, and the Service doing
per-connection load balancing. This is the mode that demonstrates everything
Docker Compose does, *plus* orchestration and autoscaling.

### Start it

```bash
npm run k8s:up           # creates the cluster, builds images, applies manifests
npm run k8s:seed         # seeds the clustered databases (a Kubernetes Job)
```

Portal is on **http://localhost:8081** — port 8081 so Docker Compose can run
side-by-side on 8080 if you want to compare.

### What runs

| Object | Replicas | Notes |
| --- | --- | --- |
| `edge` Deployment | 1 | NodePort 30080 → host 8081 |
| `api` Deployment | 2–6 | **HPA-managed** on 60% CPU |
| `auth` Deployment | 2 | fixed — login is bcrypt-bound, not throughput-bound |
| `notifications` Deployment | 2 | fixed — one partition per topic |
| `realtime` Deployment | 2 | fixed — scales on connections, not CPU |
| `email` Deployment | 2 | fixed — one Kafka partition |
| `mongo` StatefulSet | 1 | with its own PVC |
| `redis` Deployment | 1 | |
| `kafka` StatefulSet | 1 | KRaft, no ZooKeeper |

### See the autoscaler work

```bash
npm run k8s:hpa          # watch replica count change
npm run k8s:load         # drive load for 2 minutes (opens a second terminal first)
```

### Useful commands

```bash
npm run k8s:ps           # pods, services, and the HPA
npm run k8s:logs         # tail every API pod at once
npm run k8s:down         # delete the cluster (volumes and all)
```

### If pods crash on cold start

Cold-start a bare cluster: `npm run k8s:down && npm run k8s:up`. All ten pods
should reach `Ready` with zero restarts. If something is restarting, run
`kubectl -n naukri-suvidha get events --sort-by=.lastTimestamp` and
`kubectl -n naukri-suvidha logs <pod>` — most problems are the three dependency
gates (mongo, redis, kafka) still coming up.

---

## Setting up Ollama (the LLM)

Needed for résumé extraction, fit scoring, and semantic search. Without it,
the portal still works — the AI layer degrades to deterministic fallbacks
capped at a score of 70 and flagged in the UI.

### Install

```bash
# macOS
brew install ollama
brew services start ollama

# or download from https://ollama.com
```

Verify: `curl http://localhost:11434/api/tags` returns JSON.

### Pull the models

```bash
ollama pull llama3.1:8b          # or qwen2.5-coder:7b — the generation model
ollama pull nomic-embed-text     # 768-dimensional embeddings for semantic search (~274 MB)
```

### Configure the API to find it

Local dev reads `OLLAMA_BASE_URL` from `server/.env` — default
`http://127.0.0.1:11434` works out of the box.

Docker containers reach it via `host.docker.internal`. Kubernetes pods reach
it via the kind network gateway, which `infra/k8s/up.sh` detects per machine.

### Seed résumés with embeddings

```bash
npm run seed:resumes             # 10 varied résumés + their embeddings
```

Then try semantic search:

```bash
curl 'http://localhost:5001/api/resumes/search?q=event-driven+backends'
```

### Switching to Claude in production

```
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
```

One environment variable swap — no code change.

---

## Seeding the databases

| Command | What it does |
| --- | --- |
| `npm run seed` | Writes seed data if databases are empty; refuses if not |
| `npm run seed -- --fresh` | Clears everything first, then seeds |
| `npm run seed:resumes` | Adds 10 résumés with Ollama-computed embeddings |
| `npm run docker:seed` | Seeds the containerised databases |
| `npm run k8s:seed` | Seeds the Kubernetes databases via a Job |

Seed accounts:

| Role | Email | Password |
| --- | --- | --- |
| TPO (admin) | `tpo@naukrisuvidha.edu` | `Passw0rd!seed` |
| Admins | `admin1@naukrisuvidha.edu` … `admin3@` | `Passw0rd!seed` |
| Recruiters | `recruiter@<company>.naukrisuvidha.edu` | `Passw0rd!seed` |
| Students | `<firstname>.<lastname><n>@naukrisuvidha.edu` | `Passw0rd!seed` |

---

## Running the tests

```bash
npm test                       # all 202 tests across five suites
npm run test:api               # API's 142 alone
npm run test:auth              # auth service's 34 alone
npm run test:notifications    # notifications service's 13 alone
npm run test:realtime          # realtime service's 7 alone
npm run test:email             # email service's 6 alone
npm run lint                   # eslint, must be clean
npm run docs:check             # 95 claims the design doc makes about this repo
```

Tests need a local MongoDB. They **refuse to run unless the database name
contains "test"** — the guard lives in `service-kit` so a service cannot
accidentally bypass it.

CI (`.github/workflows/ci.yml`) runs lint, tests, docs:check, and
`npm audit --omit=dev --audit-level=high` on every push.

---

## Repository layout

```
naukri-suvidha/
├── server/                    the API process
│   ├── src/
│   │   ├── modules/           seven domain modules + internal/
│   │   ├── infra/             storage, llm, events, cache (interfaces + impls)
│   │   ├── middleware/        requestId, error, auth, rbac
│   │   └── config/            env loading via Zod
│   ├── scripts/               seed.js, check-design-doc.js, etc.
│   └── test/
├── services/
│   ├── auth/                  extracted auth service
│   ├── notifications/         extracted notifications service
│   ├── realtime/              extracted socket server
│   └── email/                 extracted email service
├── service-kit/               shared plumbing (tokens, errors, Redis, dotenv)
├── shared/                    Zod schemas + constants (client AND server)
├── client/                    React 19 SPA
│   └── src/
│       ├── pages/             auth, student, recruiter, admin
│       ├── api/               TanStack Query hooks
│       ├── context/           auth session
│       └── components/
├── infra/
│   ├── nginx/                 the compose edge's gateway config
│   └── k8s/                   Kubernetes manifests + edge config template
├── docs/                      architecture.svg + other notes
├── docker-compose.yml         the compose stack
├── render.yaml                Render.com production config
├── vercel.json                Vercel client config
├── CLAUDE.md                  working notes (decisions, gotchas)
├── DEPLOYMENT.md              production deployment guide
└── DEMO.md                    eight-minute demo script
```

---

## Environment variables

### `server/.env` (the API)

```
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/naukri_suvidha
JWT_ACCESS_SECRET=<32+ random bytes, must match auth service>
JWT_REFRESH_SECRET=<32+ random bytes, must match auth service>
IDENTITY_MODE=bearer                 # bearer (dev) or gateway (containers)
AUTH_GATEWAY_SECRET=<shared secret>
STORAGE_PROVIDER=local               # or s3
LLM_PROVIDER=ollama                  # or claude
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b
EMBEDDING_MODEL=nomic-embed-text
REDIS_URL=                           # optional; leave blank for in-process
KAFKA_BROKERS=                       # optional; leave blank for in-process bus
```

### `services/auth/.env`

```
PORT=5002
MONGODB_URI=mongodb://127.0.0.1:27017/naukri_suvidha_auth
JWT_ACCESS_SECRET=<same as API>
JWT_REFRESH_SECRET=<same as API>
AUTH_GATEWAY_SECRET=<same shared secret>
API_SERVICE_URL=http://127.0.0.1:5001
```

### `services/notifications/.env`

```
PORT=5003
MONGODB_URI=mongodb://127.0.0.1:27017/naukri_suvidha_notifications
KAFKA_BROKERS=                       # localhost:9094 if you started compose
REDIS_URL=                           # same
```

### `services/realtime/.env`

```
PORT=5004
AUTH_SERVICE_URL=http://127.0.0.1:5002
AUTH_GATEWAY_SECRET=<same shared secret>
REDIS_URL=
```

### `services/email/.env`

```
PORT=5005
MONGODB_URI=mongodb://127.0.0.1:27017/naukri_suvidha_email
KAFKA_BROKERS=
AUTH_SERVICE_URL=http://127.0.0.1:5002
AUTH_GATEWAY_SECRET=<same shared secret>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=<16-char Gmail app password>
MAIL_FROM="Naukri Suvidha <you@gmail.com>"
DEMO_EMAIL_OVERRIDE=                 # if set, every email rewrites to this
```

**Generating secrets.** For any `*_SECRET` run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The JWT access/refresh secrets **must be identical** between `server/.env` and
`services/auth/.env` or sign-in appears to work and then every request is
refused.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| API won't start on port 5000 | macOS AirPlay holds 5000 and answers 403. Use 5001 (the default here). |
| `MissingSchemaError: User` | A `populate()` is reaching across a service boundary. The id has moved to Auth; denormalise instead. |
| Tests destroyed my dev database | Your `.env` leaked into test mode. The `service-kit` guard refuses any DB name without "test" — don't bypass it. |
| Notifications never appear | Kafka or Redis isn't running. `docker compose up -d kafka redis`. |
| Login works then every request 401s | JWT secrets don't match between API and auth service. |
| Email send goes to spam | First Gmail-to-Gmail via app password usually does. Mark as "not spam" once. |
| K8s pods stuck pending | kind workers out of CPU. Close other Docker apps or restart Docker Desktop. |
| `kind load` fails on multi-arch image | Only side-load the project's own images; let the cluster pull public images (busybox, metrics-server). |
| Ollama returns malformed JSON | The retry logic handles one failure. Second failure falls back to deterministic scoring capped at 70. |
| Port 27017 in use | Your host mongo is on 27017; the Docker mongo is on 27018. Use that port, or stop one. |

---

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full guide. Short version:

- **Vercel** for the client (built static files)
- **Render** for all five services (API, auth, notifications, realtime, email)
- **MongoDB Atlas** for the three databases
- **S3-compatible bucket** for résumé files (Render disks are ephemeral)
- **Upstash / Confluent** for Redis + Kafka

**[DEMO.md](DEMO.md)** is the eight-minute demo script, including the run
with the model switched off.

Note on gateways: the production deploy does NOT use the nginx `auth_request`
gateway (Vercel rewrites can't run subrequests). The API runs in `bearer`
mode on Render, so the revocation window is one access-token TTL. The real
gateway runs in both container stacks on `:8080` and `:8081`.

---

## How things work

Short answers below. The authoritative decisions and the "why" live in
**[CLAUDE.md](CLAUDE.md)**.

### Authentication

Two tokens: a 15-minute **access token** kept in memory only, and a 7-day
**refresh token** in an `httpOnly` cookie scoped to `/api/auth`. Both carry a
`tokenVersion` — bumping it on a user suspends every token already issued.

In the container stacks, nginx runs an `auth_request` subrequest against the
auth service's introspection endpoint on every API call. Identity comes back
in response headers, the API trusts them (plus a shared bearer secret). In
dev mode (`npm run dev`), the API verifies tokens itself — no revocation
check until the token expires.

### Eligibility

One pure function in `shared/src/eligibility.js`. The server enforces it, the
client calls the same function to explain greyed-out jobs. Four rules: CGPA,
backlogs, branch, deadline. A matching MongoDB filter narrows per-student job
lists in the query — a test asserts the two agree.

### The AI layer

**Never runs in a request.** Work writes to `aiTasks`, then an in-process
`p-queue` worker at concurrency 2 handles it. Claims are atomic
`findOneAndUpdate` so recovered tasks never run twice.

Every model answer is validated against a Zod schema. On failure the model
gets one repair attempt with its own output and the errors. A second failure
falls back to deterministic logic capped at 70 and flagged in the UI.

### Realtime

Socket.IO lives in the realtime service. The API and notifications publish
through the Redis adapter — neither holds a socket server. A notification
is written first, pushed second: the row is what matters, the push is a
nicety.

Measured: a recruiter status change reaches an open student tab in 10ms.

### Semantic résumé search

`ollama pull nomic-embed-text` gives 768-dim vectors stored on each résumé.
`GET /api/resumes/search?q=…` ranks by cosine similarity. The corpus is
narrowed **before** ranking by whoever is asking — an admin searches all
students, a recruiter only students who applied to one of their jobs. Search
never widens who may read a résumé.

### Transactional outbox

The eight event publishers all go through `publish(event, payload, { session })`
inside the MongoDB transaction that wrote the record. An `outboxWorker`
publishes to Kafka after commit. Without a replica set (dev mode), there's no
session and events publish immediately — the publish-side window is open but
the API still works.

### The four service-to-service crossings

```
auth → API    POST /api/internal/profiles       create a Student/Company on registration
auth → API    POST /api/internal/audit          log sign-ins to the placement office trail
realtime → auth   POST /internal/introspect     authenticate the socket handshake
email → auth      GET /internal/users/:id/email look up the recipient
```

Each one exists because the data lives on the other side. CLAUDE.md explains
the measured cost of each.

---

*Design document, project plan, and project report are in `CLAUDE.md`
under "Documents". This README is maintained as the build progresses.*
