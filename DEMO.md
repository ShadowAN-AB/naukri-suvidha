# Demo script

Roughly twelve minutes, end to end - eight for the product, four for the
architecture. Rehearse it twice: once normally, and once with the model
stopped, because that second run is the one that proves the system degrades
honestly instead of falling over.

**If the evaluation is specifically about microservices, run section 10 first
and the product after.** It is written to stand alone and it is the part that
answers the question being asked. Everything before it is context for *why*
the services are split the way they are.

Sign-ins: `tpo@naukrisuvidha.edu` (placement office),
`recruiter2@vertexsystems.example.com`, `aarav.kaur1@naukrisuvidha.edu` (student).
The shared seed password is in `server/scripts/seed.js`.

---

## Before you start

- [ ] Decide **where** you are demonstrating. For the application itself,
      anything works. For the infrastructure — the gateway, the three extracted
      services, load balancing, the autoscaler — you **must** use a container
      stack: `npm run docker:up` (`:8080`) or `npm run k8s:up` (`:8081`). The
      Vercel deployment has no gateway, so section 10 does not exist there.
- [ ] Wake the API — open `/api/health`, wait for `ok`
- [ ] Wake the **auth service** too. On Render they sleep independently and the
      auth one is what a login hits first, so a cold sign-in looks broken.
- [ ] If you want live notifications to appear, the broker has to be up:
      `docker compose up -d kafka redis`. The notifications service is a pure
      consumer — with no broker it creates nothing, and an empty bell looks
      like a bug rather than a missing dependency.
- [ ] `/api/ai/health` says `ok`
- [ ] Seeded, and scores already computed
- [ ] Three browser profiles or windows, one signed in as each role
- [ ] Zoom at ~110% so the back row can read it

---

## 1. The problem (30 seconds)

Open the landing page. One line: *campus placement runs on spreadsheets and
WhatsApp; students apply to jobs they're not eligible for, and recruiters read
hundreds of résumés by hand.*

## 2. A recruiter posts a job (1 minute)

As the recruiter: **Post a job**. Fill it in, set a minimum CGPA and a branch
restriction. Submit.

**Say the important part:** it is `pending`. It is not visible to anyone yet.

## 3. The approval gate (1 minute)

Switch to the **student** window and search for that job. It is not there.

> If asked: a student fetching it by id gets a `404`, not a `403` — a `403`
> would confirm it exists.

Switch to the **placement office** → Approvals → approve it.

Back on the student window, refresh: now it appears.

## 4. Eligibility, explained (1 minute)

Scroll the student's job list. Point at a job marked **Not eligible** —
it still shows, with the reason: *"Open to CSE, IT; you are in CIVIL."*

**The point to make:** that rule exists exactly once, as a pure function in
`shared/`. The server enforces it, the client explains it, and a test asserts
that the function and the database filter return the same jobs.

## 5. The AI layer (2 minutes)

Upload a résumé on the student's **Résumé** page.

While it processes, explain: the model never runs inside a request. The upload
writes a task to `aiTasks`, and a worker picks it up at concurrency 2.

Within about ten seconds the parsed profile appears — skills, education,
experience pulled out of the PDF.

Go to **Jobs**. The list is now ordered by fit, each with a breakdown and the
model's reasoning.

## 6. Apply, and watch it move live (1 minute)

Apply to the top job. Put the **student** and **recruiter** windows side by side.

As the recruiter: **Shortlist**.

The student's window updates **without a refresh** — the alert count moves and
the application advances a stage. Measured at 10ms.

## 7. Schedule an interview (45 seconds)

Still as recruiter: **Schedule** → online, pick a time, paste a link.

> Try submitting an online interview with no link first. It refuses — that is
> the most common way to waste everyone's morning.

The student's dashboard shows it with a join link.

## 8. The placement office view (45 seconds)

Admin → **Analytics**: placement rate, offers, median CTC, an eight-week trend.
Then **Audit** — every privileged action, append-only.

## 9. The one that wins the viva (1 minute)

**Stop the model.** `pkill -f "ollama serve"`, or pull the API key.

Refresh `/api/ai/health`: **degraded**, with what that means in words.

Trigger a rescore. The scores still come back — capped at 70, labelled
*estimated*, with the reasoning saying so.

**Say this:** nothing in the portal is unavailable because the AI is. The
ranking degrades to skill matching and tells the user it has.

---

## 10. The microservices architecture (4 minutes)

Only works on a container stack, and it is the beat the evaluation is about.
Run it **first** if microservices is the stated topic.

**Open by saying what it is**, because the screen will not say it:

> Four deployables. The API, and three services extracted out of it - auth,
> notifications and realtime - each with its own image, its own process and its
> own lifecycle, behind an nginx API gateway. Three of the four own a database
> no other service can connect to. They talk to each other three ways:
> synchronous HTTP, Kafka events, and a Redis pub/sub channel.

### 10a. The services exist, and only the edge is reachable

```bash
docker compose ps
```

Point at the `PORTS` column. **Say this:** the API, auth, notifications and
realtime publish **no host port at all**. The only way in is the edge on
`:8080`. That is what makes everything after this mean something — there is no
back door to the API, so "the gateway authenticated this" is a statement about
the only path that exists.

### 10b. Database per service, not shared collections

```bash
# Three databases. The API has no connection that can read the other two.
docker compose exec mongo mongosh --quiet --eval 'db.adminCommand({listDatabases:1}).databases.map(d => d.name)'

# And prove the negative: no users collection in the API's database.
docker compose exec mongo mongosh --quiet naukri_suvidha --eval 'db.getCollectionNames()'
```

**Say this:** ownership is enforced rather than remembered. `users` lives in
`naukri_suvidha_auth`, and the API physically cannot read it even by mistake. A
shared database is the textbook way to end up with services that cannot deploy
separately.

If they ask why `realtime` has no database: it owns no data. Database-per-service
means one database per deployable that *owns data*, and live socket connections
are not data you can persist usefully.

### 10c. The gateway authenticates, and the API never sees a token

```bash
# Login is routed to the auth service. The API never sees the password.
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"tpo@naukrisuvidha.edu","password":"Passw0rd!seed"}' \
  | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')

# The API answers without verifying that token: the edge did, once.
curl -s http://localhost:8080/api/admin/overview -H "Authorization: Bearer $TOKEN"

# No token: 401 from nginx itself, in the project's own error shape - the
# client cannot tell that nginx answered rather than Node.
curl -s http://localhost:8080/api/admin/overview

# Forging the identity headers does nothing: nginx overwrites all four on
# every proxied request, and the API wants a shared secret besides.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/admin/overview \
  -H 'x-auth-user-id: 507f1f77bcf86cd799439011' -H 'x-auth-user-role: admin'
```

Expect `200`, then `401` as JSON, then `401`.

### 10d. The event-driven boundary, end to end

This is the strongest single demonstration, because one action crosses every
piece of infrastructure at once. Approve a pending job in the admin UI, then:

```bash
# A different process, with a different database, wrote the notification.
docker compose exec mongo mongosh --quiet naukri_suvidha_notifications \
  --eval 'db.notifications.find({}, {type:1, title:1}).toArray()'

# The event really went through Kafka: LAG 0 means that group consumed it.
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group notifications.job-approved
```

**Say this:** the API committed the job and the event in one transaction - a
transactional outbox - and then stopped caring. The notifications service, a
different process with a different database, consumed the event and wrote the
row. It could not have looked the job title up even if it wanted to, so the
event carries what its consumers need.

### 10e. A service with no sockets pushing to one

```bash
# The realtime service holds every socket. Nothing that pushes holds one.
docker compose exec redis redis-cli PSUBSCRIBE 'socket.io#/#*'
```

Leave that running and mark a notification read in the browser. **Say this:**
the notifications service has no Socket.IO server at all. It publishes to a
Redis channel, and the realtime service - which holds the connection - delivers
it. The adapter was added so a second API *replica* would not break pushes, and
it turned out to be exactly what crossing a service boundary needs.

### 10f. Independent scaling, live

```bash
npm run docker:scale          # the API to 3 replicas, while it is running
for i in $(seq 1 10); do
  curl -s http://localhost:8080/api/health | sed 's/.*"instance":"\([^"]*\)".*/\1/'; echo
done | sort | uniq -c
```

**Say this:** only the API scaled. auth did not, because login is bcrypt-bound
rather than throughput-bound, and notifications cannot, because each topic has
one partition so a third replica would be assigned nothing. **Scaling the thing
that is actually loaded, and not the things that are not, is the point of
splitting them.** On Kubernetes an HPA does this from CPU instead of a typed
number - `npm run k8s:hpa` in one terminal and `npm run k8s:load` in another.

### 10g. The beat that wins it — revocation

Sign in as a student in the browser, confirm a page loads, then suspend that
account directly in the auth service's own database:

```bash
docker compose exec mongo mongosh --quiet naukri_suvidha_auth --eval \
  'db.users.updateOne({email:"aarav.kaur1@naukrisuvidha.edu"},{$set:{status:"suspended"}})'
```

Reload. The **same unexpired token** is refused.

**Say this:** the API could not possibly do that - it has no users collection.
The auth service does it, once, at the edge, on every request. That is what the
gateway buys back, and it is the clearest answer to "what did splitting this
actually get you".

Put it back afterwards with `status:"active"`.

---

## Questions to expect

| They ask | The answer |
|---|---|
| Is this microservices? | **Yes — four deployables, three of them extracted services.** `services/auth/`, `services/notifications/` and `services/realtime/` each have their own image, process and lifecycle, behind an nginx API gateway; three of the four own a database nothing else can connect to. Seven domain modules remain inside the API process, and that is a deliberate boundary rather than an unfinished one — see the next row. |
| Why are seven modules still together? | Because the cost of a boundary here is **measured, not guessed**, and it recurs per service: an introspection hop on every request, a two-service write that needs a compensation because no transaction spans it, a `populate` that cannot cross, an event that must carry its audience, a broker that becomes load-bearing, three start-up races, and a database per deployable to seed in step. One person cannot operate ten deployments alongside coursework. The seam is real either way — modules never import each other's services, they publish domain events — which is exactly why three of them came out without the rest changing shape. |
| How did you choose which three? | By measurement, not preference. **auth** first: it gives the gateway a real job and exercises synchronous RPC with its failure mode. **notifications** second, chosen by counting coupling — it was the only module *no other module read*, and it already consumed five events rather than being called, so it demonstrates the *other* kind of boundary, event-driven and asynchronous. **realtime** third because it cost nothing: it owned no collection, read nothing and was read by nobody. Together they cover both halves of what a service boundary can be. |
| What would you extract next, and why not yet? | `profiles`, and the order is measured: it reads nothing and is read by seven modules, so it is a pure provider and extracting it early means every later extraction is written against a remote profiles client once. Not yet because the two hardest cases need redesigns rather than moves — the analytics `$lookup` **cannot cross databases at all**, and the job list is filtered per student *inside the query*, so `jobs` would have to denormalise eligibility facts behind a `profile.updated` event. |
| Do the services share a database? | No. `users` and `refreshTokens` live in `naukri_suvidha_auth`, notifications in `naukri_suvidha_notifications`, so the API has no connection that could read either even by mistake — ownership enforced rather than remembered. `realtime` has no database because it owns no data. A shared database is the textbook way to end up with services that cannot deploy separately. |
| Why does realtime have no database? | Because database-per-service means one database per deployable that **owns data**, and it owns none — it holds live socket connections, which are state in memory by definition. Giving it a database to satisfy the pattern would be the paperwork without the benefit. |
| How does the API know who the caller is, if it never sees the token? | The edge ran an nginx `auth_request` against the auth service and forwarded the identity in headers. Two things stop a client forging them: nginx sets all four on *every* proxied request, so a client's values are always overwritten, and the API additionally requires a shared secret. Be straight about the limit if pushed — that secret is a bearer secret, not a per-request signature, so a signed assertion like Envoy's `ext_authz` is the upgrade path. |
| What happens if the auth service goes down? | Nobody can sign in, and existing sessions stop too, because introspection is on every request - and since the realtime extraction, new socket handshakes fail as well, for the same reason. That is the honest cost of a synchronous boundary and the reason it is two replicas with `maxUnavailable: 0` — measured at 200 consecutive requests with zero failures through a rolling restart. The reverse is less severe: with the API down, a login still returns 200, because the audit write that crosses back is fire-and-forget. |
| What if registration half-fails across the two services? | There is no transaction spanning them, so it compensates: write the user, ask the API for the profile, delete the user if the API refuses. Verified by stopping the API — 503, and zero orphaned user rows. The remaining window is this process dying between the two writes, and the real fix is the outbox pattern already used for events. |
| What stops a recruiter approving their own job? | Role check on the route; the recruiter gets a 403. And the status field isn't in the create schema, so Zod strips it. |
| What if the LLM returns nonsense? | Zod validates it; on a violation the model gets one repair attempt showing its own output; a second failure falls back to pattern matching, capped and flagged. |
| What if two people click apply at once? | A unique `(jobId, studentId)` index. One gets 201, the other 409. There's a test that fires both simultaneously. |
| Can a recruiter read any résumé? | Only from a student who applied to one of their jobs. Otherwise 403. |
| How do you know the eligibility rules are consistent? | They exist once as a function; the database filter is derived from the same rules, and a test runs both over the same data and compares. |
