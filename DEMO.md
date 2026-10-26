# Demo script

Roughly nine minutes, end to end - eight for the product, one for the
architecture beat at the end. Rehearse it twice: once normally, and once
with the model stopped, because that second run is the one that proves the
system degrades honestly instead of falling over.

Sign-ins: `tpo@naukrisuvidha.edu` (placement office),
`recruiter2@vertexsystems.example.com`, `aarav.kaur1@naukrisuvidha.edu` (student).
The shared seed password is in `server/scripts/seed.js`.

---

## Before you start

- [ ] Decide **where** you are demonstrating. For the application itself,
      anything works. For the infrastructure — the gateway, the two services,
      load balancing, the autoscaler — use a container stack:
      `npm run docker:up` (`:8080`) or `npm run k8s:up` (`:8081`). The Vercel
      deployment has no gateway, so the step 5 beats below do not exist there.
- [ ] Wake the API — open `/api/health`, wait for `ok`
- [ ] Wake the **auth service** too. On Render they sleep independently and the
      auth one is what a login hits first, so a cold sign-in looks broken.
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

## 10. One service, and the gateway in front of it (1 minute)

Only worth doing on a container stack, and worth doing *last* because it is the
one beat that is about the architecture rather than the product.

**Say first:** every request so far went through an API gateway, and the sign-in
was answered by a different process from everything else. Nothing on screen
said so, which is the test of whether the gateway works.

Then show three things, in this order:

```bash
# 1. Two services. Note the auth service has no host port: the edge is the
#    only way in, which is what makes the next command mean something.
docker compose ps

# 2. The gateway refuses an unauthenticated request itself, in the project's
#    own error shape - the client cannot tell that nginx answered, not Node.
curl -s http://localhost:8080/api/admin/overview

# 3. Sending the identity yourself does nothing. The edge overwrites all four
#    headers on every proxied request, and the API wants a shared secret.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/admin/overview \
  -H 'x-auth-user-id: 507f1f77bcf86cd799439011' -H 'x-auth-user-role: admin'
```

**The beat that lands**, if there is time for one more: sign in as the student
in a browser, confirm a page loads, then suspend that account directly in the
auth service's own database —

```bash
docker compose exec mongo mongosh --quiet naukri_suvidha_auth --eval \
  'db.users.updateOne({email:"aarav.kaur1@naukrisuvidha.edu"},{$set:{status:"suspended"}})'
```

— and reload. The *same unexpired token* is refused. **Say this:** the API
could not do that any more; it has no users collection. The auth service does
it, once, at the edge, on every request. That is what the gateway is for.

Put it back afterwards with `status:"active"`.

---

## Questions to expect

| They ask | The answer |
|---|---|
| Why not microservices, when your diagram had ten? | **One of them is.** Auth runs as its own service, own image, own database, behind an API gateway — `services/auth/`. The other nine are modules with their own collections and their own events on the bus, because one person cannot operate ten deployments in sixteen weeks. The useful part is that the extraction is no longer hypothetical: the cost of that one boundary is measured — an introspection hop on every request, a two-service write that needs a compensation instead of a transaction, two databases to seed in step — and *that* is the argument for not paying it nine more times. |
| Which one did you extract, and why that one? | Auth. It gives the gateway a real job, and it exercises the one inter-service style nothing else here does: synchronous RPC, with its failure mode. Kafka already demonstrates the asynchronous style, so extracting the AI layer — the other candidate — would mostly have re-demonstrated that. |
| Does the auth service share the database? | No. It owns `naukri_suvidha_auth`, so the API has no connection that could read `users` even by mistake — ownership enforced rather than remembered. A shared database is the textbook way to end up with two services that cannot deploy separately. |
| How does the API know who the caller is, if it never sees the token? | The edge ran an nginx `auth_request` against the auth service and forwarded the identity in headers. Two things stop a client forging them: nginx sets all four on *every* proxied request, so a client's values are always overwritten, and the API additionally requires a shared secret. Be straight about the limit if pushed — that secret is a bearer secret, not a per-request signature, so a signed assertion like Envoy's `ext_authz` is the upgrade path. |
| What happens if the auth service goes down? | Nobody can sign in, and existing sessions stop too, because introspection is on every request. That is the honest cost of a synchronous boundary and the reason it is two replicas with `maxUnavailable: 0` — measured at 200 consecutive requests with zero failures through a rolling restart. The reverse is less severe: with the API down, a login still returns 200, because the audit write that crosses back is fire-and-forget. |
| What if registration half-fails across the two services? | There is no transaction spanning them, so it compensates: write the user, ask the API for the profile, delete the user if the API refuses. Verified by stopping the API — 503, and zero orphaned user rows. The remaining window is this process dying between the two writes, and the real fix is the outbox pattern already used for events. |
| What stops a recruiter approving their own job? | Role check on the route; the recruiter gets a 403. And the status field isn't in the create schema, so Zod strips it. |
| What if the LLM returns nonsense? | Zod validates it; on a violation the model gets one repair attempt showing its own output; a second failure falls back to pattern matching, capped and flagged. |
| What if two people click apply at once? | A unique `(jobId, studentId)` index. One gets 201, the other 409. There's a test that fires both simultaneously. |
| Can a recruiter read any résumé? | Only from a student who applied to one of their jobs. Otherwise 403. |
| How do you know the eligibility rules are consistent? | They exist once as a function; the database filter is derived from the same rules, and a test runs both over the same data and compares. |
