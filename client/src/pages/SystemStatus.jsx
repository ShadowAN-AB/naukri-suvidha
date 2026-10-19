import { useHealth } from '../api/health.js';

const PHASES = [
  ['1', 'Foundation', 'scaffold, 11 schemas, seed data, infra interfaces', 'current'],
  ['2', 'Auth and shell', 'register, log in, land on the right dashboard', 'next'],
  ['3', 'Profiles and jobs', 'a recruiter posts, an admin approves, a student sees', 'todo'],
  ['4', 'Resumes and applying', 'upload, apply, move through the pipeline', 'todo'],
  ['5', 'The AI layer', 'parsed profiles and a fit-ranked job list', 'todo'],
  ['6', 'Live and analytics', 'notifications, interviews, admin dashboard', 'todo'],
  ['7', 'Harden and ship', 'tested, deployed, documented', 'todo'],
];

function Dot({ ok }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
      aria-hidden="true"
    />
  );
}

export default function SystemStatus() {
  const { data, isPending, isError, error } = useHealth();

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Nexus</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Campus placement portal</h1>
        <p className="mt-3 text-muted">
          Phase 1 of 7 — foundation. This page exists to prove the stack is wired end to end.
        </p>

        <section className="mt-10 rounded-xl border border-line bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            System status
          </h2>

          {isPending && <p className="mt-3 text-sm text-muted">Checking…</p>}

          {isError && (
            <div className="mt-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-red-600">
                <Dot ok={false} /> API unreachable
              </p>
              <p className="mt-1 text-muted">
                {error.message}
                {error.requestId ? ` (request ${error.requestId.slice(0, 8)})` : ''}
              </p>
              <p className="mt-2 text-muted">
                Is the server running? <code className="rounded bg-slate-100 px-1">npm run dev</code>
              </p>
            </div>
          )}

          {data && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">API</dt>
              <dd className="flex items-center gap-2 font-medium">
                <Dot ok={data.status === 'ok'} /> {data.status}
              </dd>
              <dt className="text-muted">Database</dt>
              <dd className="flex items-center gap-2 font-medium">
                <Dot ok={data.db === 'up'} /> {data.db}
              </dd>
              <dt className="text-muted">Environment</dt>
              <dd className="font-medium">{data.env}</dd>
              <dt className="text-muted">Uptime</dt>
              <dd className="font-medium">{data.uptimeSeconds}s</dd>
            </dl>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Build phases</h2>
          <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
            {PHASES.map(([n, name, detail, state]) => (
              <li key={n} className="flex gap-4 px-5 py-3">
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    state === 'current'
                      ? 'bg-accent text-white'
                      : 'bg-slate-100 text-muted'
                  }`}
                >
                  {n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {name}
                    {state === 'current' && (
                      <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                        in progress
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-muted">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
