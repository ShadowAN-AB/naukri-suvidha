# Naukri Suvidha — working notes for Claude

AI-assisted campus placement portal. Final-year project, built solo over seven
phases. **Phases 1–6 complete and tagged; Phase 7 is ~5/8 done.**

Read this before changing anything. The decisions below were argued out once
and should not be re-litigated without a reason.

---

## Commands

```bash
npm run dev            # client :5173, API :5001  (needs mongod + ollama)
npm test               # 84 tests, Vitest + Supertest, needs a local mongod
npm run lint           # eslint, must be clean
npm run seed -- --fresh   # 3 admins, 6 companies, 40 students, 12 jobs
npm run seed:resumes      # 10 varied résumés + embeddings, for search
npm run resumes:check     # extraction report over server/test/fixtures/

npm run docker:up         # the whole stack in containers, on :8080
npm run docker:seed       # seed the containerised mongo (one shot)
npm run docker:scale      # take the API to 3 replicas, live
npm run docker:ps         # what is running
npm run docker:down       # stop it
```

Health: `/api/health` (db state) and `/api/ai/health` (provider, queue, degraded behaviour).

---

## The decisions that matter

**Modular monolith, not microservices.** The original design had ten services,
Kafka, Redis and Kubernetes. What exists is ten *modules* in one Express
process, keeping every service boundary and domain event. The reason is
operational — one person cannot run ten deployments alongside coursework. The
seam is real: modules never import each other's services, they publish events,
so extraction later is a change of transport. **If asked "why not microservices",
that is the answer.**

**The model never runs inside a request.** Résumé extraction and fit scoring
write a row to `aiTasks`; a `p-queue` worker at concurrency 2 handles them. The
database row is the durable part — the queue is lost on restart, so stranded
tasks are reclaimed on boot and claimed with an atomic `findOneAndUpdate`.

**Every model answer is validated, then repaired once.** Zod schema → on
violation, one retry showing the model its own output and the failures → on a
second failure, a deterministic fallback. Fallbacks are **capped at 70 and
flagged in the UI**, so a guess can never outrank a judgement. Stopping Ollama
must never stop the portal; there is a demo beat that depends on this.

**Eligibility exists exactly once**, as a pure function in `shared/`. The server
enforces it, the client explains refusals with it. It is duplicated as a MongoDB
filter (a per-student list must be narrowed in the query), and a test asserts
the two return identical results over the same data. Do not add a third copy.

**Colour exists exactly once**, in `client/src/index.css`, as role tokens
(`card`, `muted`, `danger`, `accent-soft`) defined twice — under `:root` and
`.dark`. Components name the role, never a hue, so a screen is written once and
both themes follow. **Never write a Tailwind palette class** (`bg-white`,
`text-slate-600`, `bg-emerald-50`) in this project; there is a token for it.
The identity is a five-colour pastel set — `#CDB4DB #FFC8DD #FFAFCC #BDE0FE
#A2D2FF` — which sits at L 0.80–0.89, so the pastels serve as the tint layer
(and as text on dark), while text and solid fills use deeper shades derived at
the same hue. Every pair that carries text was checked at 4.5:1 before being
chosen; the ratio is in the CSS next to the value. The two line-chart series
keep blue/amber rather than blue/pink, because blue against pink loses about
four fifths of its separation under protanopia.

**Navigation is a sidebar above `lg` and a bottom tab bar below it**, never a
hamburger. A hamburger hides every destination behind a tap on exactly the
screen size where people browse most. Both read one `NAV` table in
`AppLayout.jsx`, so a route is added in one place.

**The infrastructure concepts are built, not described.** The course requires
load balancing, Redis, Kafka, Kubernetes, an API gateway, microservices, CDN
and Docker. The system design document designs all of them; `docker-compose.yml`
is where they actually run. **Step 1 is done** — see "Running it as containers"
below. Steps 2–5 are in "What's left". Treat the compose stack as the thing to
extend, not a parallel toy: it builds from the same Dockerfiles a deploy would.

**Redis is optional, and the portal must stay correct without it.** No
`REDIS_URL` and everything runs as it always did: an in-process cache, a
per-process rate limiter, sockets held in one process. That is right for one
instance and quietly wrong for two, which is the whole reason step 2 exists.
With it set, three things become shared — the cache (`infra/cache/redis.js`),
the rate-limit counters, and the Socket.IO adapter. A Redis failure is always
a miss or a warning, never a failed request: a cache that takes the request
down with it is worse than no cache.

**Kafka is optional too, and what it buys is narrower than it looks.** With
`KAFKA_BROKERS` set, a domain event is produced to a topic named after it and
delivered by a consumer group named after the subscriber — so `notifications`
and `ai` each get their own copy of `application.submitted` instead of
competing, and a handler interrupted by a dying container has not committed
its offset, so the event comes back. Without it the bus is in-process exactly
as before. **It does not close the publish-side window**: producing still
happens after the database write rather than with it. That needs a
transactional outbox, which needs transactions, which need a replica set —
and development runs on a standalone mongod. Say that plainly rather than
claiming §2.2 is closed.

**Route guards in React are convenience, not security.** Every rule is enforced
again on the server.

**Retrieval only where it earns its place.** Extraction and scoring fit in
context and do not use it. Semantic résumé search does. Search never widens who
may read a résumé — the corpus is narrowed in the DB filter *before* ranking.

---

## Conventions

- Services hold rules and never touch `req`/`res`; routes do HTTP only.
- One error shape everywhere: `{ error: { code, message, requestId, details? } }`.
- Validation is Zod in `shared/`, imported by both sides. Never duplicate a schema.
- `404` not `403` where a `403` would confirm a resource exists.
- Commit messages explain *why*, including what a bug's symptom was. Tag each
  phase (`v0.1.0-phase1` …).
- Comments explain reasoning, not mechanics. No comment that restates the code.

---

## Gotchas that already cost time

| | |
| --- | --- |
| **Port 5000** | macOS AirPlay holds it and answers `403`. API is on **5001**. |
| **Express 5 `req.query`** | A getter. Assigning to it is silently dropped — broke schema defaults, gave `NaN` pagination. Use `Object.defineProperty`. |
| **`pdf-parse` 2.x** | A `PDFParse` class, not `pdfParse(buffer)`. Every tutorial shows 1.x. |
| **dotenv `override: true`** | Needed so a parent's `PORT` can't steal the port — but it also meant `.env` beat the test runner and **the suite dropped the dev database**. `env.js` now reads `.env.test` when `NODE_ENV=test`, and `test/setup.js` refuses any DB whose name lacks "test". Do not remove either guard. |
| **Vite proxy** | `/socket.io` needs its own entry with `ws: true`; `/api` alone silently breaks realtime. |
| **`pkill -f "src/server.js"`** | Also kills the dev server started by the preview. Prefer stopping the preview properly. |
| **Tailwind 50 vs 500** | Any rename sweeping `bg-x-50` before `bg-x-500` turns the latter into `bg-x-<new>0`, an invalid class that silently renders nothing. It ate every status dot and fit bar once. Order the longer key first. |
| **`limit` caps differ** | Jobs max **50**, applications max **100** (`shared/src/validation/`). Over the cap is a `400`, not a clamp, and the list just renders empty — which is how the applicants filter sat broken. |
| **Unlayered CSS beats utilities** | Tailwind 4 puts utilities in `@layer utilities`, and *any* unlayered rule wins over a layered one whatever the specificity. A bare `:focus-visible` in `index.css` could not be switched off by `focus-visible:outline-none`, so inputs drew two focus rings. Base rules belong in `@layer base`. |
| **The name is Naukri Suvidha** | Never "Nexus". The npm scope is `@naukri-suvidha/*`, the refresh cookie is `naukri_suvidha_rt`, the theme key is `naukri-suvidha-theme`, seeded accounts are `@naukrisuvidha.edu`. The old name is gone from the repository; keep it that way. |
| **nginx balances per DNS lookup** | `proxy_pass` to a *variable* plus `resolver` is what makes scaling work at all — a literal upstream resolves once at start-up and pins replica 1. But the granularity is then the resolver TTL, not the request, and the spread is uneven because it follows Docker's record order: measured 6/5/3, then 7/3, over three replicas. Back-to-back requests inside one TTL window all hit one container. Kubernetes Services balance per connection, which is the real fix. |
| **ioredis offline queue** | Leave it ON. `rate-limit-redis` loads its Lua script inside its constructor, which runs at **import time**, long before a connection exists. With `enableOfflineQueue: false` that command rejects immediately, nothing is listening, and the process dies on boot — every replica unhealthy, with a stack trace pointing at the rate limiter rather than at the flag. `maxRetriesPerRequest` is what bounds the queue; disabling it is not. |
| **Kafka consumer startup is serial by default** | Joining a consumer group costs a rebalance round trip of seconds. Started one after another, eight groups took ~40s before `app.listen()` ran — the healthcheck gave up and Docker restarted the container, which started the 40s again. Start them with `Promise.all`: it drops to under a second. |
| **ESLint + JSX** | Base `no-unused-vars` doesn't count JSX references; `react/jsx-uses-vars` is enabled for that. |

---

## What's left

**Infrastructure, in order. Each step must run and be demonstrable before the
next begins, and this list is the record of where it got to.**

1. ~~**Docker Compose stack**~~ — **done**: nginx + 2 API replicas + mongo,
   scaling live, balancing visible. `docker-compose.yml`.
2. ~~**Redis**~~ — **done**: shared cache behind `infra/cache/`, shared
   rate-limit counters, and the Socket.IO adapter, which let `/socket.io`
   stop being pinned to one replica in nginx. Analytics is the first real
   consumer of the cache, at a 60s TTL.
3. ~~**Kafka**~~ — **done**: events travel through a broker, one consumer
   group per named subscriber, crash-redelivery on the consume side. The
   publish-side window is *not* closed — that needs an outbox, which needs
   transactions, which need a replica set (the compose mongo is standalone).
   Making it one would be the next honest increment.
4. **Kubernetes** — manifests plus an HPA, on kind or minikube. Replaces the
   DNS-TTL balancing with per-connection Service balancing.
5. **Extract a service** — auth or ai first; they are the cleanest seams.
   An API gateway in front of it.

Then the original list:

1. **Deploy** — Vercel + Render + Atlas + an S3 bucket. Configs are written;
   see `DEPLOYMENT.md`. Needs the user's accounts. The step people miss is
   replacing both `REPLACE-ME.onrender.com` in `vercel.json`.
2. **Seed production and pre-compute scores** before any demo.
3. **Rehearse the demo twice**, once with Ollama stopped — `DEMO.md`.
4. **20 real résumés** into `server/test/fixtures/`, then `npm run resumes:check`.
   Extraction is tuned against clean text; real résumés are two-column or scanned.
5. Optional: a UI for semantic search (API-only today), and Atlas `$vectorSearch`
   (written, untested — a standalone mongod rejects it).

---

## Running it as containers

`npm run docker:up` builds two images and starts four containers on
**http://localhost:8080**. `npm run docker:seed` fills the containerised
database; the host's own mongod and dev server are untouched.

| Container | What it is | Reachable at |
| --- | --- | --- |
| `edge` | nginx: serves the built client, proxies `/api`, balances it | `localhost:8080` |
| `api` ×2 | the Express server | **nowhere from the host, on purpose** |
| `mongo` | MongoDB 7 | `localhost:27018` (27017 is left for the host's own) |
| `redis` | cache, rate-limit counters, socket pub/sub | `localhost:6380` (6379 left for the host's own) |
| `kafka` | the domain event log, KRaft mode, no ZooKeeper | `localhost:9094` from the host, `kafka:9092` inside |

**The API publishes no host port.** That is deliberate: the only way in is
through the load balancer, which is also what lets it scale past one replica
without a port collision. `npm run docker:scale` takes it to three while it
is running.

To see the balancing rather than take it on trust, nginx returns the replica
that answered:

```bash
for i in $(seq 1 10); do
  curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i x-upstream-addr
  sleep 2.5
done
```

**What this demonstrates today:** containerisation, horizontal scaling, load
balancing, an edge that is simultaneously static host, reverse proxy and
cache, Redis doing the three jobs a second replica makes necessary, and Kafka
carrying the domain events between them.

Three one-liners that prove Redis rather than asserting it:

```bash
# Shared rate limit: 429 on the 6th attempt even across 3 replicas.
# Per-process counters would have allowed 15.
for i in $(seq 1 7); do curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tpo@naukrisuvidha.edu","password":"wrong"}'; done

# Shared cache: cached:false once, then cached:true - from any replica.
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/admin/analytics | grep -o '"cached":[a-z]*'

# The socket adapter's pub/sub channels, one Redis for every replica.
docker compose exec redis redis-cli PUBSUB CHANNELS 'socket.io*'

# Kafka: approve a posting, then watch the event that carried it.
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group notifications.job-approved
```

That last one is the demonstration worth showing: CURRENT-OFFSET equal to
LOG-END-OFFSET with LAG 0 means the event was produced to the broker and
consumed by that group, and the notification it wrote proves the handler
ran.

The model is deliberately *not* containerised: it runs on the host and the
API reaches it through `host.docker.internal`. It is large, and the portal is
built to degrade without it anyway.

---

## Documents

- **Project plan** (design, data model, phase checklists):
  https://claude.ai/code/artifact/9e031f77-7e4b-442b-9edb-d85c7c00c803
- **Project report** (21 sections, submittable draft):
  https://claude.ai/code/artifact/9ee5f933-efa2-40ac-9d36-a7f69079a76d

Both are living documents — keep them in step with the code.
