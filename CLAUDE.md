# Naukri Suvidha — working notes for Claude

AI-assisted campus placement portal. Final-year project, built solo over seven
phases. **Phases 1–6 complete and tagged; Phase 7 is ~6/8 done.**

**All nine required infrastructure concepts now run** — the last two,
microservices and an API gateway, landed with step 5. What remains in Phase 7
is deployment, the demo rehearsal and real résumés, not infrastructure.

Read this before changing anything. The decisions below were argued out once
and should not be re-litigated without a reason.

---

## Commands

```bash
npm run dev            # client :5173, API :5001, auth :5002, notif :5003,
                       # realtime :5004, email :5005
npm test               # 202 tests over five suites, needs a local mongod
                       # (= api 142 + auth 34 + notif 13 + realtime 7 + email 6;
                       #  realtime needs no database at all;
                       #  a standalone
                       #  mongod exercises the no-transaction path, CI's
                       #  replica set exercises the outbox)
npm run test:api          # the API's suite alone
npm run test:auth         # the auth service's alone
npm run test:notifications  # the notifications service's alone
npm run lint           # eslint, must be clean
npm run seed -- --fresh   # 3 admins, 6 companies, 40 students, 12 jobs
                          # writes BOTH databases - see AUTH_MONGODB_URI
npm run seed:resumes      # 10 varied résumés + embeddings, for search
npm run resumes:check     # extraction report over server/test/fixtures/
npm run docs:check        # 95 claims the design doc makes about this repo

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

Health: `/api/health` (db state, plus `instance` — which replica answered),
`/api/ai/health` (provider, queue, degraded behaviour), the auth service's own
`/health` on :5002, the notifications service's on :5003, and the realtime
service's on :5004 — which reports no `db` at all, because it owns none. The
three services' endpoints are in-cluster only in both container stacks.

---

## The decisions that matter

**Four services out, with the fourth deliberately out of the measured order.**
31 Oct 2026: Abdullah asked for a fourth service that **sends email** to
students for scheduled interviews - the specific use case his teacher wanted
to see at the evaluation. That is `services/email/`, added as a pure Kafka
consumer with its own database, calling the auth service for the recipient
email (the fourth crossing, documented above). It took three previous services
out in the measured order (auth, notifications, realtime); this one was out of
order, for a specific demonstration, and the record says so.

So: **do not extract a fifth without being asked**, and do not read `email` as
permission to resume the full split. The measured order below is for the seven
remaining modules and is still correct; `email` was a module nobody had ever
written, so it slots in beside them rather than consuming one of their rows.
Equally, **do not revert the four that are out** — they are what makes the
architecture demonstrable rather than described.

What that overrode is worth keeping, because the cost it named is real and will
be paid: the system was deliberately **eight modules in one Express process
plus auth and notifications as separate services**, on the grounds that one
person cannot operate ten deployments alongside coursework. That objection was
not wrong — it is a prediction about operating the result, and nothing about
the code refutes it. It was overruled, not disproved. Expect the compose and
Kubernetes stacks, the seed path and CI to get materially heavier with each
extraction, and treat that as the known price rather than a surprise.

The seam itself is genuine, which is why this is feasible at all: modules never
import each other's services, they publish domain events, and the two
extractions already done came out without the remaining modules changing
shape.

**The cost of a boundary here is measured, not guessed, and it is now being
paid deliberately.** Two extractions bought exact figures: an introspection hop
on every request, a two-service write that needs a compensation because no
transaction spans it, a `populate` that cannot cross, an event that must carry
its audience, a broker that became load-bearing, three start-up races, and a
database per deployable to seed in step. Those were the argument against
extracting the rest. They are now the **estimate for doing so** — every one of
them recurs per service, and the list is the best available prediction of what
each extraction will cost. Point at `services/auth/` and `services/notifications/`
for what the pattern looks like when it is finished.

**Auth was the right one to extract first**, and not because it was easiest.
It gives the gateway a real job, and it exercises the one inter-service style
nothing else here did: synchronous RPC, with its failure mode.

**Notifications was the right second**, chosen on measured coupling rather
than a guess — and the measurement contradicted this file's earlier guess that
`ai` was next. `notifications` is the only module **no other module reads**,
and it already consumed five domain events rather than being called. `ai` reads
four other modules' collections and is read by two.

| Module | reads others | read by |
| --- | --- | --- |
| `notifications` | 3 | **nobody** |
| `resumes` | 3 | `ai` |
| `interviews` | 4 | `admin` |
| `ai` | 4 | `applications`, `jobs` |

The two extractions demonstrate **different** inter-service styles, which is
why doing both was worth it: auth is request-driven and synchronous,
notifications is event-driven and asynchronous. Together they cover both halves
of what a service boundary can be.

**And the second one made the broker load-bearing.** auth needs mongo and a
caller; without the caller it is idle. notifications has no caller — every
notification begins with a Kafka message — so where the API degrades to an
in-process bus without a broker, this service has no in-process publisher to
listen to and would serve an inbox that never fills. Its `/health` says
`events: no broker configured` and it warns at boot rather than looking fine.
**`npm run dev` therefore needs `docker compose up -d kafka redis` before a
notification will appear.** That is a real cost of extracting an event-driven
service, and it is the honest version of the claim.

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
and Docker. The system design document designs all of them; `docker-compose.yml`,
`services/auth/` and `infra/k8s/` are where they actually run. **All five steps
are done** — see "Running it as containers" and "Running it on Kubernetes"
below for how to show each of them.

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

**The limiter obeys that rule now, and it took two wrong fixes** (29 Oct 2026).
It used to answer **500** on a login when Redis was configured and
unreachable, because `express-rate-limit` turns a rejected store into a
rejected request. Both obvious repairs were wrong, and the second is the one
worth remembering:

- **`passOnStoreError: true`** lets the request through *unlimited*, so a Redis
  outage would mean unbounded password guessing on `/login`. It stops failing
  requests by stopping being a limiter. **Never set it** — `docs:check` pins
  its absence.
- **Try Redis, fall back when it throws** cost **~15s per request** against a
  dead port, waiting out `maxRetriesPerRequest`. Worse, five increments at 15s
  is 75s against a 60s window, so the window expired and the counter reset —
  **the limit stopped biting at all**. A fallback that is slower than its own
  window is not a fallback.

What works is gating on `getRedis()?.status === 'ready'`, which ioredis
already tracks and which costs nothing to read: not ready means count in
process immediately rather than issue a command that will time out, with a
try/catch underneath for the ready-but-failing race. Recovery needs no probe —
ioredis returns to `ready` itself and `rate-limit-redis` reloads its Lua
script on the next call. Measured after: seven bad logins with Redis away give
`401`×5 then `429`×2, six increments in **0ms**, and two stores on a live
Redis share one counter. `service-kit/src/rateLimitStore.js` carries the
reasoning and the numbers.

**The general lesson, because it generalises past this one file:** a fallback
has to be measured on the path that uses it. Both wrong fixes would pass any
test asking only "is the request served".

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

**Each service owns its data in its own database, not its own collections.**
`users` and `refreshTokens` live in `naukri_suvidha_auth` and `notifications`
in `naukri_suvidha_notifications`, so the API has no connection that could read
either even by mistake — ownership enforced rather than remembered. A shared
database would have been far less work and is the textbook way to end up with
services that cannot deploy separately.

**Database-per-service means one database per *deployable*, and that is where
it stops.** There are three deployables and three databases. Giving each of the
remaining eight *modules* its own would be the paperwork of the pattern without
its benefit: they share a process, a deployment and a failure domain, so a
database boundary buys nothing — and it would cost 28 cross-module model
imports, seven `populate` call sites and the analytics `$lookup`, which cannot
cross databases at all. Measured before deciding, not assumed. If a third
database is wanted, extract a third service.

**When a join crosses a boundary, denormalise.** This is not a workaround, it
is the pattern. `auditLogs.actorId` was `ref: 'User'` with a `populate` to show
who acted; once `users` moved, the admin screen answered 500 with
`MissingSchemaError`, which names mongoose rather than the boundary. The row
carries `actorEmail` and `actorRole` now, written by whoever acted — and for an
audit log that is the *better* design, because it records the email the actor
had at the time rather than whatever a renamed account says today. **An `id`
that crosses a service boundary carries no `ref`**, in any model; a `ref`
naming a model the process does not register is a loaded gun for the next
person who reaches for populate.

**An event carries what its consumers need.** The notification handlers used to
look up the student, the company and the job to work out who to tell — possible
only while they shared a process and a database with those collections. The
publishers resolve the audience now, inside the services that own it, and the
payload carries it (`recruiterUserId`, `studentUserId`, `jobTitle`,
`studentName`). The reads did not disappear, they **moved to the service that
owns the collection**. An event that cannot be acted on without reading the
publisher's data is not an event, it is a trigger to go and ask — and a
consumer with its own database cannot ask.

**One service holds every socket, and nobody who pushes holds one.** Since
`realtime` was extracted the client connects to `/socket.io` on **that**
service, and both the API and notifications publish through the Redis adapter's
channel without holding a socket server at all.

The adapter is why this was the cheapest extraction available. It was added in
step 2 so a second API *replica* could not silently break realtime - one
container held the socket, another emitted the event. The same wiring now
carries an emit across a *service* boundary, which is the same problem one
layer out, so moving the socket server needed no new mechanism and no
publisher had to change. **Measured**: a push published to Redis by a process
with no socket server arrived at a socket held by the realtime process, and
another user's did not leak into it.

What it costs is that Redis stops being optional in the way it is elsewhere.
Without it the API degrades to an in-process bus and the cache to a local one;
`realtime` instead accepts connections and delivers nothing, because every
push originates in another process. Same shape as the broker for
notifications, one layer out: extracting a component makes the transport
under it load-bearing.

**Four crossings** exist as of 31 Oct 2026, and the list is still the whole
price of the boundaries. The first three passed a specific test: a piece of
data lives on the other side and the caller has no way to reach it. The
fourth passes the same test for the same reason - the email service needs the
student's email, which only auth owns.

| | | |
| --- | --- | --- |
| `auth → API` | `POST /api/internal/profiles` | synchronous. A Student or Company is the API's, so registration is a write in two services with no transaction spanning them — write the user, ask for the profile, **delete the user if the API refuses**. A compensation, not a rollback. |
| `auth → API` | `POST /api/internal/audit` | fire-and-forget. A sign-in still belongs in the placement office's trail. Crossing a boundary did not change what the write is worth, so a failure is logged and swallowed exactly as it was. |
| `realtime → auth` | `POST /internal/introspect` | the socket handshake only. It carries its token in the Socket.IO connection payload and `/socket.io` is proxied straight through, so it is the one entry point no gateway can authenticate. **This was `API → auth` until the realtime extraction**: the API made the call only because it hosted the socket server, so it moved with the sockets and the API now talks to the auth service not at all. |
| `email → auth` | `GET\|POST /internal/users/:id/email` | synchronous, and the fourth crossing. Student emails live in `naukri_suvidha_auth.users` and nowhere else; `Student.userId` has no `ref` on purpose (the API has no connection that could `populate()` it). So the service that sends email asks the service that owns the address. Note what this does **not** do: the API still calls auth not at all - the one line that was expensive to get back and would be expensive to lose. |

A different fourth was written and then deleted: the admin dashboard's `users`
count. The figure was computed and never rendered — the dashboard shows four
tiles and that was not one of them. **A crossing added for a number nobody
displays is a dependency bought for nothing.** The email crossing is not that
shape - every send genuinely needs the lookup.

**The gateway authenticates; the API does not.** `IDENTITY_MODE` picks one of
two strategies behind one interface, the same shape as `infra/cache`:

- `gateway` — the edge ran nginx `auth_request` against the auth service and
  forwarded the identity in headers. The API verifies no token and reads no
  user. **Both container stacks run this.**
- `bearer` — verify the access token here and trust its claims. No database
  lookup, because the users collection is not the API's. This is what
  `npm run dev` and the test suite use, and the cost is exact: **no revocation
  check**, so a suspended account keeps access until its access token expires.

So the gateway is not decoration — it buys back the revocation check the API
can no longer perform. Suspend an account and its unexpired token is refused on
its next request; verified on both stacks.

**Trusting a header is the sharp edge, so it has two locks.** nginx sets all
four identity headers on *every* proxied request, including empty on the
unauthenticated ones, so a client's own values are always overwritten — and the
API additionally requires a shared secret, so reaching the port is not enough.
Be precise about the limit: that secret is a bearer secret shared by three
processes, **not a per-request proof**, so anything holding it and a route to
the API can mint any identity. A short-lived signed assertion (Envoy's
`ext_authz`, ALB's `X-Amzn-Oidc-Data`) removes that and is the upgrade path.
`server/test/gateway.test.js` tests the strategies directly.

**service-kit holds only what two services having their own copy would make a
*bug*.** Not what is merely convenient to share — that test is what stops a
shared library from growing until the two services cannot deploy
independently. Today: the token functions (auth mints, the API verifies, so two
copies are two definitions of a session), the one error shape, the dotenv rules
including the `.env.test` guard, the Redis connection with its two boot-crash
fixes, and `USER_STATUS`. Tokens, errors and Redis are **factories**, not
modules that read `env` — two services resolve their environment at different
moments, and a module-level `import { env }` would let import order decide
whether the secrets were loaded.

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
| **An outbox row that fails to publish must not be re-claimed by its own tick** | The worker loops claiming due rows until there are none. A failed publish that goes straight back to `pending` is therefore claimed again immediately, forever — `running` never clears, and every later tick returns early, so the whole outbox silently stops. A test caught it. The fix is the same shape as the retry worker's: a `nextAttemptAt` the claim filters on, with a floor. The outbox's backoff is 2s–60s rather than the retry worker's 10s–10min, because this is the fast path for every event and not a long-stop for failures. |
| **A replica set advertises its members, so the member host matters** | A client connects to the seed address, is told the member list, and then connects to *those* names. So the host in `rs.initiate` has to be an address the clients can resolve: `mongo:27017` in compose, the pod's own `mongo-0.mongo.<ns>.svc.cluster.local` in Kubernetes (not the headless Service, which answers with whatever pod it likes), and `127.0.0.1:27017` in CI. Get it wrong and the driver connects, discovers a member it cannot reach, and hangs in server selection rather than failing clearly. Reaching the compose mongo from the **host** now needs `directConnection=true`, because `mongo:27017` resolves only inside that network. |
| **`?replicaSet=rs0` is not optional in the URI** | A single seed host with no `replicaSet` parameter is treated as a direct connection, and `withTransaction` is refused on a direct connection even when the node *is* a replica set member. The replica set without the URI parameter buys nothing. |
| **A CI service container cannot be given a command** | The `services:` syntax takes an image, env, ports and docker-create options — there is no way to pass `--replSet`. mongod is therefore started as a **step** in `ci.yml`, with its own wait-and-initiate loop. Worth knowing before trying to put it back as a service: a standalone CI would pass while never once exercising the transactional path. |
| **nginx balances per DNS lookup** | `proxy_pass` to a *variable* plus `resolver` is what makes scaling work at all — a literal upstream resolves once at start-up and pins replica 1. But the granularity is then the resolver TTL, not the request, and the spread is uneven because it follows Docker's record order: measured 6/5/3, then 7/3, over three replicas. Back-to-back requests inside one TTL window all hit one container. Kubernetes Services balance per connection, which is the real fix — now built, in `infra/k8s/`, measured at 10/10 over 20 back-to-back requests. The compose edge keeps this behaviour on purpose; the two stacks are meant to differ. |
| **ioredis offline queue** | Leave it ON. `rate-limit-redis` loads its Lua script inside its constructor, which runs at **import time**, long before a connection exists. With `enableOfflineQueue: false` that command rejects immediately, nothing is listening, and the process dies on boot — every replica unhealthy, with a stack trace pointing at the rate limiter rather than at the flag. `maxRetriesPerRequest` is what bounds the queue; disabling it is not. |
| **A queued Redis command that nobody awaits kills the process** | The offline queue defers a command; `maxRetriesPerRequest` eventually gives up on it and `flushQueue` **rejects every queued command**. Any of those without a handler is an unhandled rejection, and Node exits on those. Two places had none, and neither was visible under compose because `depends_on: service_healthy` meant Redis was always up first. Kubernetes starts pods in parallel and an autoscaler churns them, so both showed up immediately. (1) `RedisStore`'s constructor keeps its two `SCRIPT LOAD` promises unawaited — the API died on boot, in `CrashLoopBackOff`, 5–6 restarts before Redis happened to win the race. The library already self-heals (`retryableIncrement` reloads the script on a rejection); it just never got to, so observing the rejection is the entire fix. (2) The Socket.IO adapter's `SUBSCRIBE` — this one let the API reach "server listening", serve traffic for ~30s, and *then* exit. The pub/sub pair is now `maxRetriesPerRequest: null`: nothing awaits those commands, so queueing them until Redis returns is right, while the main connection keeps a bound because the cache is on the request path and must fail fast to a miss. Verified: a pod with `REDIS_URL` on a dead port now runs 3m+ with 0 restarts and serves `200`. |
| **Kafka consumer startup is serial by default** | Joining a consumer group costs a rebalance round trip of seconds. Started one after another, eight groups took ~40s before `app.listen()` ran — the healthcheck gave up and Docker restarted the container, which started the 40s again. Start them with `Promise.all`: it drops to under a second. |
| **ESLint + JSX** | Base `no-unused-vars` doesn't count JSX references; `react/jsx-uses-vars` is enabled for that. |
| **A rebuilt image under an unchanged tag does not roll** | `naukri-suvidha/api:dev` is mutable, so rebuilding changes what it points at without changing the pod template. `kubectl apply` says `unchanged`, `kind load` says it loaded, and the pods keep serving the previous build — the fix is applied everywhere except where it runs. `up.sh` substitutes the built image's id into a pod-template annotation, which puts the content back inside the thing apply compares. A rebuild that changed nothing is then still correctly a no-op. |
| **`kind load docker-image` and multi-arch public images** | It imports `--all-platforms`, but `docker pull busybox:1.37` on an arm64 Mac leaves a manifest list whose other platforms' layers are absent, so the import dies with `content digest … not found` — and `set -e` then aborts the rest of the script. Only side-load the two images that have no registry behind them; let the nodes pull anything public themselves. |
| **A listening Kafka port is not a Kafka that has your topics** | `nc -z kafka 9092` succeeds the moment the broker binds, which on a cold cluster is well before any topic exists. A consumer subscribing then gets `KafkaJSProtocolError: This server does not host this topic-partition` from its metadata request, `startTransport` throws, and `main()` exits 1 — one restart, only ever on a genuinely cold broker, which is why compose never showed it. The irony is that the failing metadata request is itself what triggers auto-creation, so the retry always worked. kafkajs marks the error `retriable: true`; the fix is to not be in the race — `ensureTopics` creates every registered event's topic with `waitForLeaders: true` before any consumer subscribes. Topic names come from the handlers, so there is no second list of events to keep in step. |
| **A `populate` cannot cross a service boundary, and mongoose blames itself** | `auditLogs.actorId` was `ref: 'User'` with a `.populate()`. Once `users` moved to the auth service's database the admin audit screen answered **500** with `MissingSchemaError: Schema hasn't been registered for model "User"` — which names mongoose, not the boundary. The route had no test, so it shipped. Denormalise instead (`actorEmail`, `actorRole` on the row), and **give an id that crosses a boundary no `ref` at all**: five other models had an inert `ref: 'User'`, each a 500 waiting for whoever reached for populate next. |
| **`ensureTopics` built from *this* process's handlers is not enough** | It derived the topic list from the registered subscribers, which was right while one process held them all. The notifications service subscribes to `job.approved` and `interview.scheduled`, which nothing in the API listens to — so those topics stayed uncreated until the first produce. The API is the only producer, so it creates **every** event's topic now, from `EVENTS`. |
| **`createTopics` is not the idempotent no-op it looks like** | The deepest version of the topic race, and it took three wrong fixes. (1) *Subscribe and hope* — `nc -z kafka 9092` passes before any topic exists, so the first consumer's metadata request gets `This server does not host this topic-partition` and `subscribe` throws out of boot. (2) *Let the other service create them* — written as a confident comment, wrong within the hour: Kubernetes starts pods in parallel, so **both notifications replicas restarted once** on a cold cluster. (3) *Both services call `createTopics({ waitForLeaders: true })`* — the subtle one. A topic that already exists comes back as a **per-topic error**, kafkajs logs `Topic creation errors`, the call **resolves anyway**, and it then does *not* wait for leaders on the topics it did not create. So two services racing both believe the topics are ready and the loser subscribes to a partition with no leader elected — **the API restarted once this way**. The fix separates creation from readiness: create, ignore who won, then poll `fetchTopicMetadata` until every partition reports a leader ≥ 0. That is true whoever created what, which is the only property that survives parallel starts. In `service-kit/src/kafkaTopics.js`, with the history, because two copies of this were both wrong. |
| **A pinned count is only as good as its glob** | `docs:check` counted test files across `server/test/` and `services/auth/test/`. A third service's suite appeared and the count stayed at thirteen and **passed**, while there were fourteen — the exact rot the check exists to catch, inside the check. The glob is `services/*/test/*.test.js` now. |
| **Extracting an event-driven service makes the broker required** | Not optional, the way it is for the API. A pure consumer has no in-process publisher to fall back to, so with no `KAFKA_BROKERS` it serves its inbox and creates nothing, forever, while looking perfectly healthy. `npm run dev` needs `docker compose up -d kafka redis` before a notification appears. The service's `/health` reports `events` and `push` separately so a degraded one is visible rather than inferred from an empty list. |
| **Readiness must not depend on the broker** | Tempting for a consumer, and wrong: the inbox still serves from the database, which is the half that matters. A pod removed from the Service because Kafka is away would stop people *reading* notifications in order to signal that new ones are not arriving. Report it in `/health`; keep readiness about mongo. |
| **`proxy_pass` to a *variable* does no URI rewriting** | The usual way to strip a prefix is a trailing slash — `proxy_pass http://auth:5002/`. That works only for a *literal* upstream. The compose edge needs a variable so Docker's DNS is re-resolved, and with a variable nginx silently ignores the trailing slash and passes the URI through unchanged: `/api/auth/login` arrived at the auth service as `/api/auth/login` and 404'd, which reads as a broken service rather than a proxy that stopped rewriting. Use an explicit `rewrite`. The Kubernetes edge has a stable ClusterIP, so its literal `proxy_pass` strips the prefix correctly and needs no rewrite — the two configs differ here for the same reason they differ about `resolver`. |
| **`rewrite ... break` stops the `set` after it from running** | `break` ends the rewrite module's processing for that location, and `set` is a rewrite-module directive — so a `set` written *after* the rewrite never executes, `proxy_pass` gets an empty variable, and nginx logs "using uninitialized variable" and answers 500. The `set` goes first. |
| **`auth_request` always issues a GET** | Whatever the original request's method, and the body is dropped. A POST-only introspection endpoint therefore answered 404 to the gateway, which reported `auth request unexpected status: 404` and turned *every* API request into a 500 — the error names the status, not the method, so it looks like a routing problem. Introspect takes both verbs now, and GET is the better fit for something that reads a header and changes nothing. `auth_request` also keeps only the subrequest's **response headers** (via `auth_request_set`) and discards its body, which is why introspection returns the identity in headers as well as JSON. |
| **`docker compose up --build` skips services in a profile** | So the `seed` image is never rebuilt with the rest of the stack, and `docker compose run seed` will happily use a cached one. A stale seed image wrote all 49 users into the API's database instead of the auth service's, leaving a seeded portal where nobody could sign in — the students were there, their users were in the wrong place, and nothing said so. `docker:seed` passes `--build`. Same shape as the mutable-tag row above. |
| **Importing a model to get its schema creates its collections** | `mongoose.model()` registers on the **default** connection, and registering a model builds its indexes, which creates the collection. The seed script needs the auth service's schemas on a *second* connection, and importing `model.js` to get them quietly created empty `users` and `refreshtokens` collections in the **API's** database — nothing failed, there was simply a users collection where the whole point of step 5 is that there is not one. The schemas live in a side-effect-free `services/auth/src/schemas.js`; import that, never `model.js`. |
| **`{{range .IPAM.Config}}{{.Gateway}}{{end}}` concatenates IPv4 and IPv6** | kind enables IPv6 on its Docker network on some versions, so the obvious template yields `172.24.0.1fc00:f853:ccd:e793::1`. That is not an address: `OLLAMA_BASE_URL` then fails `env.js`'s `url()` check and **every API pod exits 1 on boot**, with a message that points at the model rather than at `up.sh`. Print one gateway per line and take the first IPv4 one. |
| **A rolling update of auth is a rolling update of everything** | Every API request runs an introspection subrequest against it, so `maxUnavailable: 0` and the 5s `preStop` matter more here than anywhere else — a dropped introspection is a 500 on somebody's ordinary request. Measured: `kubectl rollout restart deployment/auth` while hammering an authenticated route served **200 consecutive requests with 0 non-200s**. |
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
   publish-side window needed an outbox, which needed transactions, which
   needed a replica set — step 4a below.
4. ~~**Kubernetes**~~ — **done**: `infra/k8s/`, on kind, with an HPA that
   scales the API 2→6 on CPU. The DNS-TTL balancing is gone — a Service
   balances per connection, measured 10/10 over 20 back-to-back requests
   where compose managed 6/5/3 with 2.5s between them. See "Running it on
   Kubernetes" below.
4b. ~~**Transactional outbox**~~ — **done**: `publish(event, payload,
   { session })` writes the event inside the transaction that wrote the
   record, and `outboxWorker` publishes it after the commit. All eight call
   sites converted. Without a replica set there is no session to pass and
   publishing stays immediate, so a standalone mongod still works — the
   window simply stays open, as it always did. §2.2 and §7.7 of the design
   document are the places that describe the gap this closed.
4a. ~~**Single-node replica set**~~ — **done**: both mongods run
   `--replSet rs0`, so `session.withTransaction` is legal where it was
   refused. One node, no redundancy — that is not what it is for. The
   healthcheck in compose and the readiness probe in Kubernetes double as
   the initiator, which is idempotent by construction and needs no one-shot
   Job ordered against a node that may not be listening yet.
5. ~~**Extract a service, behind an API gateway**~~ — **done**: `services/auth/`
   is its own workspace, image, process and **database**, and the edge is now
   an API gateway that routes by prefix and authenticates every `/api` request
   against it with nginx `auth_request`. That closes the last two of the nine
   required concepts — microservices and an API gateway. See "The decisions
   that matter" for the three crossings and the identity modes, and
   "Running it as containers" / "Running it on Kubernetes" for how to show it.

5b. ~~**Extract a second service**~~ — **done**: `services/notifications/`, its
   own image, process and database, chosen on measured coupling (it is the only
   module nothing else reads). It demonstrates the *other* kind of boundary —
   event-driven and asynchronous, where auth is request-driven and synchronous
   — and it is what made the broker load-bearing. See "The decisions that
   matter".

**All nine infrastructure concepts now run.** Load balancing, Redis, Kafka,
Kubernetes, an API gateway, microservices, Docker, a CDN (the edge, standing in
for one) and horizontal scaling. Nothing on this list is designed-but-absent
any more.

**The order to extract in, if it resumes.** Measured 30 Oct 2026 by counting
model imports in both directions, the same way `notifications` was chosen
rather than guessed. Nothing here is in progress — it is a plan, not a state.
`internal` is the service-to-service surface, not a domain module, and is not
extracted.

| module | reads | read by | owns |
| --- | --- | --- | --- |
| `realtime` | nothing | **nobody** | nothing |
| `profiles` | **nothing** | **7** | `Student`, `Company` |
| `resumes` | 3 | 1 | `Resume` |
| `interviews` | 4 | 1 | `Interview` |
| `ai` | 4 | 2 | `FitScore`, `AiTask` |
| `admin` | 4 | 4 | `AuditLog` |
| `applications` | 4 | 4 | `Application` |
| `jobs` | 3 | **5** | `Job` |

The order follows from two findings in that table, neither of which a guess
would have produced:

1. ~~**`realtime` first, because it costs nothing.**~~ **Done.** It owns no collection, reads
   nothing and is read by nobody — it holds Socket.IO and that is all. It
   establishes the pattern without a single data-ownership decision, and it is
   the mirror of `notifications`: that service already pushes through the API's
   Redis adapter, so moving the socket server out makes the API a publisher to
   it too.
2. **`profiles` second, although it is the most disruptive.** It reads nothing
   and feeds **seven** modules, so it is a pure provider. Extracting it early
   means every later extraction is written against a remote profiles client
   once, instead of each one re-breaking the same edge. Left until last, the
   same seven edges get rewritten piecemeal seven times.

Then `resumes`, `interviews`, `ai` (low fan-in), then `jobs` and
`applications` (the hot path), and **`admin` last** — see below for why it
cannot go earlier.

**Two problems to solve before the modules that depend on them move.**

- **The audit trail is a write dependency, not a read one.** `admin` looks
  read-by-4 only because four modules write `AuditLog` rows. That is already
  solved: the auth service writes them with fire-and-forget
  `POST /api/internal/audit`. Convert the four writers to the same call and
  four inbound edges disappear without extracting anything.
- **The analytics `$lookup` cannot cross databases at all**, which is why
  `admin` goes last. There is no transport that makes a cross-database
  aggregation work; it has to become a read model that `admin` maintains from
  domain events. That is a redesign, not a move.

**And eligibility is the hard case nobody should discover late.** The job list
is narrowed **per student in the query** by CGPA, branch and graduation year,
so once `profiles` is a service the `jobs` query cannot reach that data. The
answer is this file's own rule — when a join crosses a boundary, denormalise:
`jobs` keeps the eligibility facts it filters on, fed by a `profile.updated`
event. A synchronous call cannot replace a query filter.

For reference, the coupling all of this has to convert: **29 cross-module model
imports** (27 static, 2 dynamic), **six `populate` call sites** and **one
`$lookup`**, pinned by `docs:check`.

Then the original list:

1. **Deploy** — Vercel + Render + Atlas + an S3 bucket. Configs are written for
   **both** services; see `DEPLOYMENT.md`. Needs the user's accounts. The step
   people miss is replacing the three placeholders in `vercel.json`, which are
   now **two different hostnames** (`REPLACE-ME-AUTH` once, `REPLACE-ME-API`
   twice) — getting them the wrong way round gives the same symptom as leaving
   them, a login page that does nothing.

   **This deployment has no gateway**, and the difference is worth stating
   rather than discovering: Vercel's rewrites do the routing, but a rewrite
   cannot run an `auth_request`, so the API runs `IDENTITY_MODE=bearer` there
   and the revocation window is the access-token TTL. The gateway runs in the
   two container stacks. If the gateway is part of what is being presented,
   present it on `:8080` or `:8081`, not on the Vercel URL.
2. **Seed production and pre-compute scores** before any demo.
3. **Rehearse the demo twice**, once with Ollama stopped — `DEMO.md`.
4. **20 real résumés** into `server/test/fixtures/`, then `npm run resumes:check`.
   Extraction is tuned against clean text; real résumés are two-column or scanned.
5. Optional: a UI for semantic search (API-only today), and Atlas `$vectorSearch`
   (written, untested — a standalone mongod rejects it).

---

## Running it as containers

`npm run docker:up` builds four images and starts six containers on
**http://localhost:8080**. `npm run docker:seed` fills **all three**
containerised databases; the host's own mongod and dev server are untouched.

| Container | What it is | Reachable at |
| --- | --- | --- |
| `edge` | nginx: serves the client, routes `/api`, balances it, **and authenticates every request** | `localhost:8080` |
| `api` ×2 | the Express server, seven modules | **nowhere from the host, on purpose** |
| `realtime` | every socket in the system, and no database | **nowhere from the host, on purpose** |
| `auth` | the extracted auth service, own image and own database | **nowhere from the host, on purpose** |
| `notifications` | the extracted notifications service, own image and own database | **nowhere from the host, on purpose** |
| `mongo` | MongoDB 7 | `localhost:27018` (27017 is left for the host's own) |
| `redis` | cache, rate-limit counters, socket pub/sub | `localhost:6380` (6379 left for the host's own) |
| `kafka` | the domain event log, KRaft mode, no ZooKeeper | `localhost:9094` from the host, `kafka:9092` inside |

**Neither service publishes a host port.** That is deliberate: the only way in
is through the edge, which is also what lets the API scale past one replica
without a port collision — and what makes "the edge authenticated this" a
statement about the only path that exists. `npm run docker:scale` takes the API
to three while it is running.

To see the balancing rather than take it on trust, nginx returns the replica
that answered:

```bash
for i in $(seq 1 10); do
  curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i x-upstream-addr
  sleep 2.5
done
```

**What this demonstrates today:** containerisation, horizontal scaling, load
balancing, an edge that is simultaneously static host, reverse proxy, cache
**and API gateway**, **two extracted services each with its own database**,
Redis doing the three jobs a second replica makes necessary plus carrying
socket emits across a service boundary, and Kafka as the only thing one of
those services hears at all.

The notifications service is the one worth demonstrating, because it closes a
loop that spans every piece of the infrastructure at once:

```bash
# Approve a pending job as the admin. The API commits the job and its event in
# one transaction (the outbox), produces to Kafka, and is done.
curl -s -X POST http://localhost:8080/api/jobs/<id>/approve -H "Authorization: Bearer $TOKEN"

# A different process, with a different database, wrote the notification.
docker compose exec mongo mongosh --quiet naukri_suvidha_notifications \
  --eval 'db.notifications.find({}, {type:1, title:1, body:1}).toArray()'

# And it pushed to a socket it does not hold, through the API's adapter.
docker compose exec redis redis-cli PSUBSCRIBE 'socket.io#/#*'
```

Measured on this stack: the row appears in `naukri_suvidha_notifications` with
the real job title; the API's database holds **11 collections and no
`notifications`**; the inbox through the gateway returns it with `unread: 1`;
marking it read returns `200` and another user gets `404`, not `403`; and the
`PSUBSCRIBE` shows `notification:new` on `socket.io#/#user:<id>#` — published
by a process with no sockets, addressed to that user's room.

The gateway, proved rather than asserted — each of these was run:

```bash
# Login is routed to the auth service; the API never sees the password.
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"tpo@naukrisuvidha.edu","password":"Passw0rd!seed"}' \
  | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')

# The API answers without ever verifying that token: the edge did, once.
curl -s http://localhost:8080/api/admin/overview -H "Authorization: Bearer $TOKEN"

# No token: 401 from nginx, in the project's own error shape - which is the
# test of a gateway, because the client cannot tell who refused it.
curl -s http://localhost:8080/api/admin/overview

# Sending the identity headers yourself does nothing: nginx overwrites all
# four on every proxied request, and the API wants a shared secret besides.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/admin/overview \
  -H 'x-auth-user-id: 507f1f77bcf86cd799439011' -H 'x-auth-user-role: admin'

# Neither service's internal surface is reachable from outside. 404, not 403.
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/api/internal/profiles
```

Measured on this stack: login `200` with an `httpOnly` cookie scoped to
`/api/auth`; the authenticated call `200`; no token `401` as JSON; forged
headers `401`; a forged `x-auth-user-role` left the real role untouched; a
student on an admin route `403`; both internal prefixes `404`; balancing
`5 / 5` over two replicas; and the login rate limit `401`×5 then `429`.

**The one demonstration worth rehearsing** is revocation, because it is what
the gateway buys back. Sign in, confirm a request works, then suspend the
account directly in the auth service's database — `docker compose exec mongo
mongosh naukri_suvidha_auth --eval 'db.users.updateOne({email:"..."},
{$set:{status:"suspended"}})'` — and the *same unexpired token* is refused on
its next request. The API could not do that any more; it has no users
collection. The auth service does it, once, at the edge.

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
side-loads the four images and applies `infra/k8s/`. The portal is on
**http://localhost:8081** — 8081 and not 8080, so the compose stack can run at
the same time and the two can be compared. `npm run k8s:seed` fills the
clustered database.

Three nodes, because a one-node cluster cannot show a Service balancing across
machines. Neither service publishes a host port here either; the only way in is
the edge.

| Object | What it is | Reachable at |
| --- | --- | --- |
| `edge` | Deployment + **NodePort** 30080 → host 8081; the API gateway | `localhost:8081` |
| `api` | Deployment, 2–6 replicas, **owned by the HPA** | `api:5001`, in-cluster only |
| `auth` | Deployment, 2 replicas, **fixed on purpose** — login is bcrypt-bound, not throughput-bound | `auth:5002`, in-cluster only |
| `notifications` | Deployment, 2 replicas, **fixed by construction** — one partition per topic, so a third replica is assigned nothing | `notifications:5003`, in-cluster only |
| `realtime` | Deployment, 2 replicas, **fixed because it scales on connections, not requests** — a socket is held while a tab is open, so CPU says almost nothing about load and the HPA's only metric would mislead. No mongo gate and no database. | `realtime:5004`, in-cluster only |
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
`ensureTopics` now runs before any consumer starts, in **every** service, and
waits for leaders rather than trusting `waitForLeaders` — see the gotcha, which
cost two more restarts before it was right. **A cold
`npm run k8s:down && npm run k8s:up` reaches a serving portal with 0
restarts**, which is the only version of this claim worth making — re-checked
with both extracted services in place: **all ten pods ready, 0 restarts on
every one**, all five of the notifications service's consumer groups joined,
both its pods in the Service's endpoints, and the full loop working — approve a
job through the gateway, and the row appears in
`naukri_suvidha_notifications` with the real job title while the inbox returns
it with `unread: 1`.

Getting there took three attempts, and the two intermediate ones each cost
restarts on a cold cluster: first both notifications pods, then an API pod.
Both were the same race seen from different sides, and the third fix is the
one that holds whoever wins.

On that cold run the `topologySpreadConstraint` **did** hold — api and auth
each landed one pod per worker — where on a re-roll earlier the same day all
four went to one node. It is `ScheduleAnyway`, a preference, so both outcomes
are correct behaviour and the honest claim is "check it", not "it spreads".

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

# The gateway, same four checks as the compose stack - identical behaviour
# through a completely different upstream strategy, which is the point of
# keeping one nginx image and two configs.
TOKEN=$(curl -s -X POST http://localhost:8081/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"tpo@naukrisuvidha.edu","password":"Passw0rd!seed"}' \
  | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
curl -s http://localhost:8081/api/admin/overview -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8081/api/admin/overview            # 401, as JSON
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8081/api/internal/profiles

# Revocation at the edge - the thing the gateway buys back. 200, then 403 on
# the same unexpired token.
kubectl -n naukri-suvidha exec mongo-0 -- mongosh --quiet naukri_suvidha_auth \
  --eval 'db.users.updateOne({email:"aarav.kaur1@naukrisuvidha.edu"},{$set:{status:"suspended"}})'

# Both auth pods are in the Service, so the edge's subrequests are balanced too.
kubectl -n naukri-suvidha get endpointslices -l kubernetes.io/service-name=auth
```

**What this demonstrates that step 1 could not:** per-connection load
balancing, readiness as a routing decision, autoscaling from a metric rather
than a typed number, rolling updates with `maxUnavailable: 0`, declarative
config and secrets separated from the image, a StatefulSet binding a database
to its own volume, and **three services configured independently** — three
ConfigMaps, one shared Secret, because the JWT secrets are the one value that
must be byte-identical across all of them.

### What step 5 added here

**Two Deployments configured independently.** `api-config` and `auth-config`
are separate ConfigMaps, so changing one cannot roll the other — that
separation *is* the step. The `api-secrets` Secret stays shared, deliberately
and for one reason: the auth service mints the access tokens the API verifies,
so a mismatch there is a sign-in that appears to work and is then refused
everywhere. One object, no copy to drift. `AUTH_GATEWAY_SECRET` lives there
too and has three consumers — the edge reads it as an env var for `envsubst`,
the two services as configuration.

**The edge's config became a template.** It has to carry a secret now, and a
secret must not be baked into an image, so `edge-nginx.conf.template` arrives
as a ConfigMap and nginx's entrypoint runs `envsubst` over it at start-up.
`NGINX_ENVSUBST_FILTER` restricts that to the one variable — without it
`envsubst` would also eat nginx's own `$host`, `$remote_addr` and
`$request_id` and produce a config that starts and is quietly wrong.

That ConfigMap is generated **without** a content hash, so editing the gateway
config leaves the pod template identical and `apply` reports "unchanged" while
the running edge keeps the old routing. `up.sh` hashes the file into a pod
annotation, which is the mutable-tag trap wearing a different hat and the same
fix.

**auth is not behind the HPA, and that is a decision.** Login is bcrypt-bound
rather than throughput-bound, and the portal does far more of everything else
than it does sign-ins. Two replicas is a fixed number on purpose — and with
Redis holding the counters, two replicas still enforce five login attempts a
minute rather than ten. Its CPU request is 100m against the API's 200m, for a
measured reason: an idle API pod burns ~39m just holding its eight Kafka
consumer groups open, and this service holds none.

**Its probes are shorter for a visible reason.** The startup probe is 30×2s
against the API's 40×3s, and there are two dependency gates rather than three.
No broker to join, so it is serving while the API is still reclaiming stranded
`aiTasks` and joining eight consumer groups. That difference is the clearest
single thing the extraction bought.

### What the notifications service added here

**Three gates, not two, and a longer grace period.** It needs the broker to do
anything at all, so Kafka joins mongo and Redis in the initContainers. Its
`terminationGracePeriodSeconds` is 45 against auth's 30: a SIGTERM can arrive
mid-handler, and leaving the consumer group cleanly is what stops the surviving
replica waiting out a session timeout before it picks up the partitions.

**Two replicas, fixed by construction rather than by preference.** Each topic
has one partition, so a third replica would join the consumer groups and be
assigned nothing. Two is about surviving a node, not throughput — and unlike
auth, its load is not request-shaped at all: it is however many events the
system produces.

**Readiness deliberately ignores the broker.** It would be tempting for a
consumer to report 503 when Kafka is away, and it would be wrong: the inbox
still serves from the database, which is the half that matters. A pod pulled
from the Service because the broker is down would stop people *reading*
notifications in order to signal that new ones are not arriving. `/health`
reports `events` and `push` separately instead.

**And it found the topic race a third time.** A comment in its consumer said it
could safely skip `ensureTopics` because the API creates the topics before it
produces. True and irrelevant: Kubernetes starts pods in parallel, so on a cold
cluster this one subscribed first, got `This server does not host this
topic-partition`, and **both replicas restarted once**. Every consumer
pre-creates its own topics now; creating one that exists is a no-op, so nobody
has to go first.

**A rolling update of auth is a rolling update of everything**, because every
API request runs an introspection subrequest against it — so `maxUnavailable:
0` and the 5s `preStop` matter more here than anywhere else. Measured:
`kubectl rollout restart deployment/auth` while hammering an authenticated
route served **200 consecutive requests with 0 non-200s**.

One thing worth not asserting: the `topologySpreadConstraint` is
`ScheduleAnyway`, a preference rather than a rule. On a cold bring-up it held
— api and auth each one pod per worker — and on a re-roll an hour earlier all
four landed on the same worker. Both are correct behaviour for a preference,
so check it rather than claiming it.

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
11 notifications, 12 security, **14 reliability & fault tolerance**,
**15 observability**, 17 diagrams, 18 sequence diagrams, 20 decisions,
**22 monolith-vs-microservices**, 23 summary, and the README.

Still carrying the other project's inventory — endpoints, collections, Redis
keys, service names that do not exist here: sections 3, 5, 13, 16, 19
and 21.

**Observability was the worst of them and is done (29 Oct 2026).** It opened
by claiming "the current repo has `console.log`" — never true — and then
specified Prometheus, Grafana, Loki, promtail, OpenTelemetry, Tempo, Sentry
and burn-rate alerting, none of which exist. It is now split into what is
built and what is not, and **eight claims pin it**, including two *absence*
claims that fail the build if anyone adds `prom-client`, `@sentry/*`, an
OpenTelemetry SDK, or an application `/metrics` route without rewriting the
prose. Both were verified to fail by planting a violation, because an absence
claim that cannot bite is worse than none.

It also records the one thing that misleads a grep: `@opentelemetry/api` **is**
in `package-lock.json`, transitively via `vitest` and the Anthropic SDK, and
instruments nothing. The pinned claim deliberately searches only
`package.json` files for that reason.

**Reliability & Fault Tolerance is done (29 Oct 2026).** It was next because
it held the most checkably wrong fact in the document — `/healthz` and
`/readyz`, which this repository has never served — and around that it
specified circuit breakers, an `X-Deadline-Ms` header, `X-Degraded`,
one-click dead-letter replay, PodDisruptionBudgets, anti-affinity, a
three-node replica set, a Redis cluster and three brokers. None exists. It is
rewritten from the code and now opens with the thing the old draft inverted:
**below the application tier nothing is redundant** — one mongo, one Redis,
one broker, one edge — so the section's subject is degradation and recovery,
which are real and measured, rather than high availability, which is not.
**Nine claims pin it, four of them absence claims**, each verified to fail by
planting a violation.

Writing it turned up a real defect, by measuring rather than reading: the
shared rate limiter answered **500** when Redis was configured and
unreachable, breaking this file's own rule about Redis failures. **That is now
fixed** — see "Redis is optional" above for the two wrong fixes it took, which
are the part worth remembering. `passOnStoreError` must stay unset, and one of
the nine claims pins its absence, because setting it would make an outage mean
no limit at all. The section's new closing subsection keeps the measurements,
since the second wrong fix passed every test that asked only whether the
request was served.

`/healthz` and `/readyz` still appear in **13 scalability** and
**16 deployment**, which are not yet retargeted; the observability section's
cross-reference now says so rather than naming section 14.

**Step 5 changed what several sections have to say, so they need a pass:**

- **22 monolith-vs-microservices is done (29 Oct 2026).** It argued for the
  monolith with the extraction as future work; two services are out, so the
  argument changed in kind — the cost of a boundary is a measurement rather
  than an estimate. **That section is now out of date**: as of 30 Oct 2026 the
  remaining modules are being extracted, so its conclusion needs rewriting
  once the first of them lands.
  The comparison gained a middle column for what actually runs, and a new
  subsection lists what a boundary cost with the symptom each produced,
  alongside **what was cheap** — which is the evidence the seam was genuine.

  Four claims pin it, and one of them caught a figure that had **already**
  rotted: the section said seven `populate` call sites where the audit-log fix
  had left six, and 28 cross-module imports where there are 29. The figures are
  six, 29 and one `$lookup` now, pinned and verified to fail by removing a
  `populate`. The lesson is the one this list keeps relearning — a number
  written from memory of a number is wrong by the time it is published.
- **5, 13, 14 and 16 describe the target architecture**, which is why they
  were worth doing after this step rather than before. Two services, two
  databases, a gateway doing `auth_request`, and the three crossings in this
  file are the inventory they need.
- **12 security** is retargeted but gains a subject: authentication now happens
  at the edge, and the forwarded-identity trust model — two locks, and a shared
  bearer secret that is explicitly *not* a per-request proof — belongs there
  stated as plainly as it is in this file.
- **4 services** should name the two that actually exist and say which nine
  modules are still in the one process.

**`npm run docs:check` pins the retargeted sections to the code** — 95
claims over routes, indexes, constants, the event topology, the counts the
document states in prose, what observability is and is not, the probes,
timeouts and retry curves the reliability argument rests on, the figures the
monolith-vs-microservices argument rests on, and the document-wide
invariants. It runs in CI. A renamed route or a dropped index fails there
and names the section whose prose has just become fiction. It does not read
the document (it cannot — that lives in an artifact); it checks that what
the document says is still true.

Three document-wide errors are fixed and worth not reintroducing:

- **The transactional outbox exists, and no section may still describe the
  publish-side window as open.** This bullet used to say the opposite, and it
  was left behind when step 4b landed — which is precisely the rot this list
  exists to catch, in the list itself. `docs:check` asserts the outbox is
  there and that all eight publish sites use it. §2.2 and §7.7 are the
  sections that described the gap; §10, §18, §20 and §21 point at it.
- **No "Nexus", and no `spp_` identifiers.** Same rule as the code.
- **Counts in prose rot silently.** Nobody re-counts a collection list, so
  the numbers the document gives are pinned: **fourteen collections** and
  **fourteen test files**. Adding either without updating §1, §2.7, §8.1, §22
  and §23 fails the build. Both are now counted **across all three services**,
  which matters: the API's barrel holds **eleven**, the auth service two and
  notifications one, and counting only the API's would silently "lose" three
  that simply moved. (It said twelve until 30 Oct 2026 - correct before
  `Notification` left the barrel with the notifications extraction, and a
  figure nobody re-counted after.) The test *count* (**190** = 142 API + 28 auth + 13
  notifications + 7 realtime) is not pinned — counting it needs a run — so it is still
  worth checking by eye, and §1 was found carrying 131 across 11 files on
  29 Oct 2026 while §22 already said 176. A pinned file count cannot catch
  that: `docs:check` reads the code, never the document's prose.
- **No "Ask Assistant", and email now lives in `services/email/`.** The old
  bullet said neither existed, and the design document's §4.12 was the
  authoritative statement for both. Email was reversed on 31 Oct 2026 for an
  evaluation, as a fourth extracted service with its own image, process and
  database - see the "do not extract a fourth" paragraph below for the
  specific scope. There is still no conversational assistant and no plan to
  add one. The §4.12 statement has been updated in the artifact and is no
  longer authoritative about email.
