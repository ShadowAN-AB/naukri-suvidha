# Naukri Suvidha — working notes for Claude

AI-assisted campus placement portal. Final-year project, built solo over seven
phases. **Phases 1–6 complete and tagged; Phase 7 is ~5/8 done.**

Read this before changing anything. The decisions below were argued out once
and should not be re-litigated without a reason.

---

## Commands

```bash
npm run dev            # client :5173, API :5001  (needs mongod + ollama)
npm test               # 123 tests, Vitest + Supertest, needs a local mongod
npm run lint           # eslint, must be clean
npm run seed -- --fresh   # 3 admins, 6 companies, 40 students, 12 jobs
npm run seed:resumes      # 10 varied résumés + embeddings, for search
npm run resumes:check     # extraction report over server/test/fixtures/
npm run docs:check        # 46 claims the design doc makes about this repo

npm run docker:up         # the whole stack in containers, on :8080
npm run docker:seed       # seed the containerised mongo (one shot)
npm run docker:scale      # take the API to 3 replicas, live
npm run docker:ps         # what is running
npm run docker:down       # stop it

npm run k8s:up            # kind cluster + metrics-server + the whole stack, on :8081
npm run k8s:seed          # seed the clustered mongo (a Job, one shot)
npm run k8s:ps            # pods, services and the HPA
npm run k8s:hpa           # watch the autoscaler decide
npm run k8s:load          # drive enough load to make it scale (default 120s)
npm run k8s:logs          # tail every API pod at once
npm run k8s:down          # delete the cluster, volumes and all
```

Health: `/api/health` (db state, plus `instance` — which replica answered) and
`/api/ai/health` (provider, queue, degraded behaviour).

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
and Docker. The system design document designs all of them; `docker-compose.yml` and
`infra/k8s/` are where they actually run. **Steps 1–4 are done** — see
"Running it as containers" and "Running it on Kubernetes" below. Step 5 is in
"What's left".

Both stacks are real and both are kept working, because they demonstrate
different things and disagree in a way that is worth being able to show: the
compose edge balances by re-resolving DNS, the Kubernetes one cannot and does
not need to. They build from the same two Dockerfiles, so neither is a
parallel toy.

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
| **nginx balances per DNS lookup** | `proxy_pass` to a *variable* plus `resolver` is what makes scaling work at all — a literal upstream resolves once at start-up and pins replica 1. But the granularity is then the resolver TTL, not the request, and the spread is uneven because it follows Docker's record order: measured 6/5/3, then 7/3, over three replicas. Back-to-back requests inside one TTL window all hit one container. Kubernetes Services balance per connection, which is the real fix — now built, in `infra/k8s/`, measured at 10/10 over 20 back-to-back requests. The compose edge keeps this behaviour on purpose; the two stacks are meant to differ. |
| **ioredis offline queue** | Leave it ON. `rate-limit-redis` loads its Lua script inside its constructor, which runs at **import time**, long before a connection exists. With `enableOfflineQueue: false` that command rejects immediately, nothing is listening, and the process dies on boot — every replica unhealthy, with a stack trace pointing at the rate limiter rather than at the flag. `maxRetriesPerRequest` is what bounds the queue; disabling it is not. |
| **A queued Redis command that nobody awaits kills the process** | The offline queue defers a command; `maxRetriesPerRequest` eventually gives up on it and `flushQueue` **rejects every queued command**. Any of those without a handler is an unhandled rejection, and Node exits on those. Two places had none, and neither was visible under compose because `depends_on: service_healthy` meant Redis was always up first. Kubernetes starts pods in parallel and an autoscaler churns them, so both showed up immediately. (1) `RedisStore`'s constructor keeps its two `SCRIPT LOAD` promises unawaited — the API died on boot, in `CrashLoopBackOff`, 5–6 restarts before Redis happened to win the race. The library already self-heals (`retryableIncrement` reloads the script on a rejection); it just never got to, so observing the rejection is the entire fix. (2) The Socket.IO adapter's `SUBSCRIBE` — this one let the API reach "server listening", serve traffic for ~30s, and *then* exit. The pub/sub pair is now `maxRetriesPerRequest: null`: nothing awaits those commands, so queueing them until Redis returns is right, while the main connection keeps a bound because the cache is on the request path and must fail fast to a miss. Verified: a pod with `REDIS_URL` on a dead port now runs 3m+ with 0 restarts and serves `200`. |
| **Kafka consumer startup is serial by default** | Joining a consumer group costs a rebalance round trip of seconds. Started one after another, eight groups took ~40s before `app.listen()` ran — the healthcheck gave up and Docker restarted the container, which started the 40s again. Start them with `Promise.all`: it drops to under a second. |
| **ESLint + JSX** | Base `no-unused-vars` doesn't count JSX references; `react/jsx-uses-vars` is enabled for that. |
| **A rebuilt image under an unchanged tag does not roll** | `naukri-suvidha/api:dev` is mutable, so rebuilding changes what it points at without changing the pod template. `kubectl apply` says `unchanged`, `kind load` says it loaded, and the pods keep serving the previous build — the fix is applied everywhere except where it runs. `up.sh` substitutes the built image's id into a pod-template annotation, which puts the content back inside the thing apply compares. A rebuild that changed nothing is then still correctly a no-op. |
| **`kind load docker-image` and multi-arch public images** | It imports `--all-platforms`, but `docker pull busybox:1.37` on an arm64 Mac leaves a manifest list whose other platforms' layers are absent, so the import dies with `content digest … not found` — and `set -e` then aborts the rest of the script. Only side-load the two images that have no registry behind them; let the nodes pull anything public themselves. |
| **A listening Kafka port is not a Kafka that has your topics** | `nc -z kafka 9092` succeeds the moment the broker binds, which on a cold cluster is well before any topic exists. A consumer subscribing then gets `KafkaJSProtocolError: This server does not host this topic-partition` from its metadata request, `startTransport` throws, and `main()` exits 1 — one restart, only ever on a genuinely cold broker, which is why compose never showed it. The irony is that the failing metadata request is itself what triggers auto-creation, so the retry always worked. kafkajs marks the error `retriable: true`; the fix is to not be in the race — `ensureTopics` creates every registered event's topic with `waitForLeaders: true` before any consumer subscribes. Topic names come from the handlers, so there is no second list of events to keep in step. |
| **nginx `$upstream_addr` stops meaning anything under a Service** | It reports the ClusterIP on every request, never a pod, because kube-proxy chooses the pod in the kernel and never tells nginx. Do not read a single repeated value there as "the balancing is broken". `/api/health` returns `instance` for that. |

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
4. ~~**Kubernetes**~~ — **done**: `infra/k8s/`, on kind, with an HPA that
   scales the API 2→6 on CPU. The DNS-TTL balancing is gone — a Service
   balances per connection, measured 10/10 over 20 back-to-back requests
   where compose managed 6/5/3 with 2.5s between them. See "Running it on
   Kubernetes" below.
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

## Running it on Kubernetes

`npm run k8s:up` creates a kind cluster, installs metrics-server, builds and
side-loads the two images and applies `infra/k8s/`. The portal is on
**http://localhost:8081** — 8081 and not 8080, so the compose stack can run at
the same time and the two can be compared. `npm run k8s:seed` fills the
clustered database.

Three nodes, because a one-node cluster cannot show a Service balancing across
machines. The API publishes no host port here either; the only way in is the
edge.

| Object | What it is | Reachable at |
| --- | --- | --- |
| `edge` | Deployment + **NodePort** 30080 → host 8081 | `localhost:8081` |
| `api` | Deployment, 2–6 replicas, **owned by the HPA** | `api:5001`, in-cluster only |
| `mongo` | StatefulSet + headless Service + PVC | `mongo:27017`, in-cluster only |
| `redis` | Deployment + Service, no volume | `redis:6379`, in-cluster only |
| `kafka` | StatefulSet + headless Service, KRaft | `kafka:9092`, in-cluster only |

`kubectl apply -k infra/k8s` is the single entry point; kustomize ships inside
kubectl, so this adds no tool. The nginx config stays a real `.conf` file
(`infra/k8s/edge-nginx.conf`) and arrives as a generated ConfigMap mounted over
the one baked into the image — one image, two stacks, each with the upstream
strategy that is right for it.

### What step 4 actually changed

**The balancing moved into the kernel, and got better.** The compose edge has
to `proxy_pass` to a *variable* with a `resolver`, because `api` resolved to
container IPs that moved and nginx resolves a literal upstream once at
start-up. The re-lookup *was* the balancing, so its granularity was the
resolver TTL. Under Kubernetes `api` is one stable ClusterIP that never moves,
so the literal upstream is correct again — and kube-proxy picks a pod per
connection, on every node, from the set the readiness probes say is ready.

Measured, through the edge, with no delay between requests:

```
20 requests, 2 pods  →  10 / 10
16 requests, 2 pods  →   5 / 11
24 requests, 6 pods  →   6 / 6 / 5 / 5 / 1 / 1   (all six, back to back)
```

Be precise about what those numbers mean. kube-proxy in iptables mode picks a
pod **at random per connection**, not round-robin, so 10/10 and 5/11 are both
ordinary draws from the same mechanism and neither is the headline. The
property that matters is that *consecutive* requests are balanced
independently at all.

That is the categorical difference. Compose over three replicas managed 6/5/3,
then 7/3, *with 2.5s gaps* — and fired back to back they all landed on one
container, because within a single resolver TTL there was only one answer to
give. Here there is no window in which the choice is already made. Nothing
about the application changed; only which layer decides, and how often.

Two consequences worth knowing:

- **`X-Upstream-Addr` now reports the ClusterIP on every request, never a pod.**
  That is the mechanism showing through, not a bug: nginx is no longer the
  balancer, so it genuinely does not know which pod served the request. Which
  pod answered comes from the pod — `/api/health` returns `instance`, which is
  `os.hostname()`.
- **There is no `upstream` block and so no `keepalive`, deliberately.** nginx
  opens a connection per proxied request, and the Service balances per
  connection; an upstream keepalive pool would pin a reused connection to one
  pod and quietly undo the whole thing — the same class of mistake as the
  resolver TTL, one layer up.

**Replica count stopped being a number a human types.** `--scale api=3` became
a HorizontalPodAutoscaler: 2 to 6 replicas, 60% CPU of request. Observed under
`npm run k8s:load`:

```
idle    cpu:   17%/60%   replicas 2
t=20s   cpu:   66%/60%   replicas 2
t=60s   cpu:  617%/60%   replicas 2 → 4 → 6
t=160s  cpu:  243%/60%   replicas 6     (1,209,773 requests, 0 failures)
```

At peak the six pods sat **3/3 across the two schedulable nodes** — the
`topologySpreadConstraint` is `ScheduleAnyway`, a preference rather than a
rule, so it is worth checking rather than assuming; it held. (kind taints the
control-plane `NoSchedule`, so three nodes means two that take workload.)

Two things that configuration cost real time:

- **The HPA needs metrics-server, which kind does not ship**, and kind's
  kubelets serve metrics with a self-signed certificate it will not trust. Both
  are handled in `up.sh`; without them the HPA reports `<unknown>` forever,
  which is the usual reason one "does nothing".
- **The CPU request is measured, not guessed.** An idle pod burns ~39m just
  holding its eight Kafka consumer groups open; a saturated one reaches about a
  full core, Node being single-threaded. At a 100m request that idle floor
  measured 39% against a 60% target — 21m of headroom — and scaling up
  *raises* the floor, because every new pod joins those same eight groups, so a
  cluster can talk itself to maxReplicas and stay there. At 200m idle measures
  **17%** and the trigger sits at three times the floor. The request is an
  HPA denominator first and a capacity estimate second; getting it wrong does
  not waste capacity, it makes the autoscaler lie.

**Probes can say the two different things compose could not.** Readiness is
`/api/health`, which already answers 503 while mongo is unreachable, so an
unhealthy pod leaves the Service's endpoints and stops being sent traffic
without being killed. Liveness is deliberately a **TCP check, not
`/api/health`** — liveness failing means "kill this container", so pointing it
at a dependency check would turn one mongo blip into a restart of every
replica at once. A startup probe covers the slow boot (mongo, eight consumer
groups, reclaiming stranded `aiTasks`) so a slow start is never mistaken for a
hang.

Measured: `kubectl rollout restart deployment/api` with `maxUnavailable: 0`
and a 5s `preStop` sleep served **73 consecutive requests with 0 non-200s**.
The preStop sleep is load-bearing — endpoint removal and SIGTERM race, because
kube-proxy's rules are updated asynchronously on every node, so without it a
pod can still be handed a connection after it has begun shutting down.

**Ordering had to be rebuilt.** compose had `depends_on: service_healthy`;
Kubernetes has no equivalent and starts everything in parallel. The API cannot
survive that alone — `connectDb()` gives mongo 10s and then throws — so three
busybox initContainers gate on mongo, Redis and Kafka. Left to crash-loop it
does recover, but the backoff is exponential to five minutes, so a broker that
takes 40s to start can keep the API down for several. This is also what
surfaced the two unhandled-rejection crashes in the gotchas table; those are
fixed properly rather than hidden behind the gates.

A port gate is necessary and not sufficient, and the cold-start path is the
only place that shows it. `nc -z kafka 9092` passes as soon as the broker
binds, but the topics do not exist yet, so the first consumer to subscribe
used to take the process down — see the Kafka topics row in the gotchas.
`ensureTopics` now runs before any consumer starts. **A cold
`npm run k8s:down && npm run k8s:up` reaches a serving portal with 0
restarts**, which is the only version of this claim worth making.

### Proving it rather than asserting it

```bash
# Per-connection balancing: back to back, no sleep, both pods answer.
for i in $(seq 1 20); do
  curl -s http://localhost:8081/api/health | sed 's/.*"instance":"\([^"]*\)".*/\1/'; echo
done | sort | uniq -c

# The autoscaler, in one terminal each.
npm run k8s:hpa
npm run k8s:load 180

# Readiness, not DNS, decides who gets traffic. Endpoints shrink and recover.
kubectl -n naukri-suvidha get endpointslices -l kubernetes.io/service-name=api

# Shared cache and shared rate limit still hold, now across pods the HPA made.
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8081/api/admin/analytics | grep -o '"cached":[a-z]*'
for i in $(seq 1 7); do curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"tpo@naukrisuvidha.edu","password":"wrong"}'; done

# Kafka, inside the cluster - no host listener here, unlike compose.
kubectl -n naukri-suvidha exec kafka-0 -- /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group notifications.job-approved
```

**What this demonstrates that step 1 could not:** per-connection load
balancing, readiness as a routing decision, autoscaling from a metric rather
than a typed number, rolling updates with `maxUnavailable: 0`, declarative
config and secrets separated from the image, and a StatefulSet binding a
database to its own volume.

**What it still does not fix.** Uploads are `STORAGE_PROVIDER=local` on an
`emptyDir`, so a file lives only on the pod that received it and leaves with
it — worse under an autoscaler than under compose, and S3 is the fix, in the
deploy step. Mongo is still a standalone, so the transactional outbox that
would close Kafka's publish-side window is still out of reach. The model still
runs on the host; pods reach it at the kind network's gateway, which `up.sh`
writes per machine because it is not the same address everywhere.


---

## Documents

- **System design** (23 sections, the artifact that gets marked):
  https://claude.ai/artifact/HgRayARQuXmeapQ6emymMF
- **Project plan** (design, data model, phase checklists):
  https://claude.ai/code/artifact/9e031f77-7e4b-442b-9edb-d85c7c00c803
- **Project report** (21 sections, submittable draft):
  https://claude.ai/code/artifact/9ee5f933-efa2-40ac-9d36-a7f69079a76d

All three are living documents — keep them in step with the code.

**The system design document was drafted against a different repository**
(`smart-placement-portal`) and is being retargeted section by section. Treat
it as unreliable about this codebase until a section says otherwise, and
never cite it as evidence of what is built — this file and the code are the
record.

Retargeted and trustworthy — sections 1 existing system, 2 problems,
4 services, 6 Redis, 7 message broker, 8 data, 9 résumé/AI, 10 workflows,
11 notifications, 12 security, 17 diagrams, 18 sequence diagrams,
20 decisions, 22 monolith-vs-microservices, 23 summary, and the README.

Still carrying the other project's inventory — endpoints, collections, Redis
keys, service names that do not exist here: sections 3, 5, 13, 14, 15, 16,
19 and 21.

**`npm run docs:check` pins the retargeted sections to the code** — 62
claims over routes, indexes, constants, the event topology and the
document-wide invariants. It runs in CI. A renamed route or a dropped index fails there
and names the section whose prose has just become fiction. It does not read
the document (it cannot — that lives in an artifact); it checks that what
the document says is still true.

Three document-wide errors are fixed and worth not reintroducing:

- **No section may claim a transactional outbox exists.** §7.7 states the
  publish-side window and that a replica set is the prerequisite. §10, §18,
  §20 and §21 point at it.
- **No "Nexus", and no `spp_` identifiers.** Same rule as the code.
- **No email/SMTP channel and no "Ask Assistant".** Neither exists in this
  repo. **§4.12 is the authoritative statement**; align anything new to it.
