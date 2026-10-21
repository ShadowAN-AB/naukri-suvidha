# Nexus — working notes for Claude

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
| **ESLint + JSX** | Base `no-unused-vars` doesn't count JSX references; `react/jsx-uses-vars` is enabled for that. |

---

## What's left

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

## Documents

- **Project plan** (design, data model, phase checklists):
  https://claude.ai/code/artifact/9e031f77-7e4b-442b-9edb-d85c7c00c803
- **Project report** (21 sections, submittable draft):
  https://claude.ai/code/artifact/9ee5f933-efa2-40ac-9d36-a7f69079a76d

Both are living documents — keep them in step with the code.
