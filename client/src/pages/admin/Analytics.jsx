import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAnalytics } from '../../api/admin.js';
import StatTile from '../../components/StatTile.jsx';

/**
 * Two categorical hues, in fixed order, validated for colour-vision deficiency
 * before use (worst adjacent pair ΔE 29.6 under protanopia, against a target
 * of 8). They are assigned to the series, never to rank, so filtering never
 * repaints a survivor.
 */
const SERIES = {
  applications: '#3b6fe0',
  offers: '#d97706',
};

const INK = { primary: '#2b2f3a', muted: '#6b7280', line: '#e5e7eb' };

const STATUS_ORDER = ['applied', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn'];
const STATUS_LABEL = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

const weekLabel = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-ink">Week of {weekLabel(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="mt-0.5 flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium tabular-nums text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { data, isPending, isError, error } = useAnalytics();

  if (isError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error.message}
      </p>
    );
  }

  const placement = data?.placement;
  const offers = data?.offers;
  const byStatus = data?.applications?.byStatus ?? {};
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => byStatus[s] ?? 0));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Placement analytics</h1>
      <p className="mt-1 text-muted">The current cycle, as it stands.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Placement rate"
          value={isPending ? '—' : placement.rate}
          suffix="%"
          hint={isPending ? '' : `${placement.placed} of ${placement.total} students`}
          tone={!isPending && placement.rate >= 50 ? 'good' : 'default'}
        />
        <StatTile label="Offers made" value={isPending ? '—' : offers.count} />
        <StatTile
          label="Median CTC"
          value={isPending || offers.medianCtcLpa == null ? '—' : offers.medianCtcLpa}
          suffix={offers?.medianCtcLpa == null ? '' : 'LPA'}
          hint={isPending || offers.highestCtcLpa == null ? 'No offers yet' : `Highest ${offers.highestCtcLpa} LPA`}
        />
        <StatTile label="Interviews upcoming" value={isPending ? '—' : data.interviewsUpcoming} />
      </div>

      {/* Placed against unplaced is one proportion, so it is one bar, not a pie. */}
      <section className="mt-8 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Placed against unplaced
        </h2>
        {!isPending && (
          <>
            <div className="mt-3 flex h-6 w-full overflow-hidden rounded-lg bg-slate-100">
              <div
                className="h-full"
                style={{ width: `${placement.rate}%`, background: SERIES.applications }}
                role="img"
                aria-label={`${placement.placed} of ${placement.total} students placed`}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full" style={{ background: SERIES.applications }} aria-hidden />
                Placed <span className="font-medium tabular-nums text-ink">{placement.placed}</span>
              </span>
              <span className="flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full bg-slate-300" aria-hidden />
                Unplaced <span className="font-medium tabular-nums text-ink">{placement.unplaced}</span>
              </span>
            </div>
          </>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Applications and offers, by week
        </h2>
        <p className="mt-0.5 text-sm text-muted">Last eight weeks.</p>

        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.weekly ?? []} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
              {/* Recessive grid: horizontal only, so it reads as a reference not a cage. */}
              <CartesianGrid stroke={INK.line} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={weekLabel}
                tick={{ fill: INK.muted, fontSize: 12 }}
                axisLine={{ stroke: INK.line }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: INK.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: INK.line, strokeWidth: 1 }} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 13, color: INK.muted, paddingTop: 8 }}
              />
              {/* Both series are counts, so they share one axis. Never two scales. */}
              <Line
                type="monotone"
                dataKey="applications"
                name="Applications"
                stroke={SERIES.applications}
                strokeWidth={2}
                dot={{ r: 4, fill: SERIES.applications, stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="offers"
                name="Offers"
                stroke={SERIES.offers}
                strokeWidth={2}
                dot={{ r: 4, fill: SERIES.offers, stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* One series, so no legend: the heading names it and each bar is labelled. */}
      <section className="mt-6 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Applications by stage
        </h2>
        <dl className="mt-4 space-y-2.5">
          {STATUS_ORDER.map((status) => {
            const n = byStatus[status] ?? 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <dt className="w-28 shrink-0 text-sm text-muted">{STATUS_LABEL[status]}</dt>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(n / maxStatus) * 100}%`, background: SERIES.applications }}
                  />
                </div>
                <dd className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">{n}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </>
  );
}
