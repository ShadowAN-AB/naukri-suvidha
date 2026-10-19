# Demo script

Roughly eight minutes, end to end. Rehearse it twice: once normally, and once
with the model stopped, because that second run is the one that proves the
system degrades honestly instead of falling over.

Sign-ins: `tpo@nexus.edu` (placement office),
`recruiter2@vertexsystems.example.com`, `aarav.kaur1@nexus.edu` (student).
The shared seed password is in `server/scripts/seed.js`.

---

## Before you start

- [ ] Wake the API — open `/api/health`, wait for `ok`
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

## Questions to expect

| They ask | The answer |
|---|---|
| Why not microservices, when your diagram had ten? | The ten service boundaries are real — ten modules, their own collections, their own events, on an in-process bus. They are module boundaries, not network ones, because one person cannot operate ten deployments in sixteen weeks. Splitting one out means replacing one `eventBus.publish` with a queue. |
| What stops a recruiter approving their own job? | Role check on the route; the recruiter gets a 403. And the status field isn't in the create schema, so Zod strips it. |
| What if the LLM returns nonsense? | Zod validates it; on a violation the model gets one repair attempt showing its own output; a second failure falls back to pattern matching, capped and flagged. |
| What if two people click apply at once? | A unique `(jobId, studentId)` index. One gets 201, the other 409. There's a test that fires both simultaneously. |
| Can a recruiter read any résumé? | Only from a student who applied to one of their jobs. Otherwise 403. |
| How do you know the eligibility rules are consistent? | They exist once as a function; the database filter is derived from the same rules, and a test runs both over the same data and compares. |
