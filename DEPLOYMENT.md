# Deploying Naukri Suvidha

Three free tiers: **Vercel** for the client, **Render** for the API, **MongoDB
Atlas** for the database, plus an S3-compatible bucket for résumés.

Work through this in order. The steps that need a browser and an account are
marked **you**; everything else is already in the repository.

---

## Why the client proxies the API

`vercel.json` rewrites `/api/*` and `/socket.io/*` to the Render URL rather than
having the browser call Render directly. That keeps the whole app **same-origin**,
which matters for one specific reason: the refresh token is an `httpOnly` cookie,
and a cross-site cookie needs `SameSite=None; Secure` and is blocked outright by
some browsers' tracking protection. Proxying sidesteps all of it.

It also means `CLIENT_ORIGIN` on Render is the **Vercel** URL, not Render's own.

---

## 1. Database — MongoDB Atlas (**you**)

1. Create a free M0 cluster.
2. Database Access → add a user with a strong password.
3. Network Access → allow `0.0.0.0/0`. Render's outbound IPs are not fixed on
   the free plan, so a narrower rule will intermittently fail.
4. Copy the connection string and append the database name:
   `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/naukri_suvidha?retryWrites=true&w=majority`

> The password goes in the URL, so URL-encode any `@ : / ?` it contains.

## 2. Résumé storage (**you**)

Render's disk is **ephemeral** — anything written to it disappears on the next
deploy. Local storage would silently lose every uploaded résumé, which is why
`STORAGE_PROVIDER=s3` is set in `render.yaml`.

Any S3-compatible service works. Cloudflare R2 has no egress fee and a free
tier; AWS S3 and Backblaze B2 are equivalent here.

1. Create a **private** bucket. It must not be public — résumés are personal data.
2. Create an access key limited to that bucket.
3. For anything that is not AWS, set `S3_ENDPOINT` to the service's endpoint.

## 3. The two services — Render (**you**)

`render.yaml` declares **two** web services now: `naukri-suvidha-api` and
`naukri-suvidha-auth`. Authentication is its own service since step 5, with its
own database.

1. New → Blueprint → point it at this repository. It reads `render.yaml` and
   creates both.
2. Fill in every variable marked `sync: false`:
   - **api**: `MONGODB_URI`, `CLIENT_ORIGIN`, the five `S3_*` values,
     `ANTHROPIC_API_KEY`
   - **auth**: `MONGODB_URI` — a *different* database name on the same Atlas
     cluster, e.g. `…/naukri_suvidha_auth` — and `CLIENT_ORIGIN`
3. The three shared secrets are generated once on the API and read by the auth
   service through `fromService`, so **do not** paste or regenerate them on the
   auth service. Two generated values would be two different secrets, and the
   symptom is a sign-in that works and is then refused on every other request.
4. Deploy both, then check
   `https://YOUR-API.onrender.com/api/health` → `{"status":"ok","db":"up"}` and
   `https://YOUR-AUTH.onrender.com/health` → `{"status":"ok","service":"auth"}`.

> **There is no gateway in this deployment, and that is a real difference from
> the container stacks.** Vercel's rewrites do the gateway's *routing*, but a
> rewrite cannot run an authentication subrequest — so the API runs
> `IDENTITY_MODE=bearer` and verifies tokens itself. The cost is exact: no
> revocation check, so a suspended account keeps access until its access token
> expires (15 minutes). `npm run docker:up` and `npm run k8s:up` are where the
> gateway runs and where that window is closed; if the gateway is part of what
> you are presenting, present it there.

> The free plan sleeps after inactivity. The first request after a sleep takes
> 30–60 seconds. **Two** services now sleep independently, so wake both before
> a demo — the auth service is the one a login hits first.

## 4. Client — Vercel (**you**)

1. Import the repository. Vercel reads `vercel.json`.
2. **Replace all three placeholders**, and note there are now two different
   hostnames:
   - `REPLACE-ME-AUTH.onrender.com` → your **auth** service URL (one rewrite)
   - `REPLACE-ME-API.onrender.com` → your **API** URL (two rewrites)

   Commit and push. This is the step that is easiest to forget; the symptom is
   a login page that does nothing and a 404 on `/api/auth/login`. Getting the
   two hostnames the wrong way round gives the same symptom, so check which is
   which.

   The order of the rewrites matters and is already correct: `/api/auth/:path*`
   must come **before** `/api/:path*`, because Vercel takes the first match —
   with `/api` first, every auth request would reach the API, which no longer
   has those routes.
3. Deploy, then set `CLIENT_ORIGIN` on **both** Render services to the Vercel
   URL and redeploy them. The auth service needs it too: it is the one that
   sets the refresh cookie.

## 5. Seed the demo data

```bash
MONGODB_URI="<your atlas uri>" \
AUTH_MONGODB_URI="<the same cluster, database naukri_suvidha_auth>" \
  npm run seed -- --fresh
```

Both, in one run, and it has to be one run: a student profile carries a
`userId`, so the users must exist in the auth service's database and their ids
must match. There is no ordering of two separate invocations that produces
that.

Then sign in as an admin and `POST /api/ai/rescore` so the fit scores exist
**before** the demo. Scoring 40 students against 9 jobs takes a few minutes, and
an empty job list during a viva looks like a bug.

## 6. Before you present

- [ ] `/api/health` returns `ok` and `db: up`
- [ ] `/api/ai/health` returns `ok`, not `degraded`
- [ ] A student's job list shows scores, not "Scoring…"
- [ ] Sign in works in a private window (proves the cookie survives a cold start)
- [ ] Open the site once ~5 minutes beforehand to wake the free tier

---

## Checking a secret never reached the repository

`.env` is gitignored and `.env.example` holds only placeholders. Before making
the repository public, confirm nothing leaked historically:

```bash
git log -p --all | grep -nE "sk-ant-|mongodb\+srv://[^<]|SECRET=[a-f0-9]{32,}"
```

No output means clean. If something does appear, rotate that credential — the
history is public even after you delete the line.

`server/.env.test` **is** committed on purpose. It holds no real secrets, points
at a throwaway database, and lets CI run the suite with no setup.
