import { useMemo } from 'react';
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
import { useTheme } from '../../context/ThemeContext.jsx';
import StatTile from '../../components/StatTile.jsx';
import PageHeader from '../../components/PageHeader.jsx';

/**
 * Recharts takes colours as props, not classes, so the theme tokens have to be
 * read out of the document rather than applied to it. Keyed on the resolved
 * theme so a toggle repaints the chart; the hues themselves live in index.css
 * next to every other colour.
 */
function useChartColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name) => style.getPropertyValue(name).trim();
    return {
      series1: read('--chart-1'),
      series2: read('--chart-2'),
      bars: read('--chart-4'),
      muted: read('--muted'),
      line: read('--line'),
      card: read('--card'),
    };
    // `resolved` is the point of the dependency even though the body never
    // names it: it is what tells us the custom properties underneath these
    // values have just been repainted. eslint cannot see through the DOM read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
}

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
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-sm shadow-sm">
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
  const c = useChartColors();

  if (isError) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
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
      <PageHeader title="Placement analytics" description="The current cycle, as it stands." />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Placement rate"
          value={isPending ? '—' : placement.rate}
          suffix="%"
          hint={isPending ? '' : `${placement.placed} of ${placement.total} students`}
          tone={!isPending && placement.rate >= 50 ? 'good' : 'default'}
        />
        <StatTile label="Offers made" tone="highlight" value={isPending ? '—' : offers.count} />
        <StatTile
          tone="accent"
          label="Median CTC"
          value={isPending || offers.medianCtcLpa == null ? '—' : offers.medianCtcLpa}
          suffix={offers?.medianCtcLpa == null ? '' : 'LPA'}
          hint={isPending || offers.highestCtcLpa == null ? 'No offers yet' : `Highest ${offers.highestCtcLpa} LPA`}
        />
        <StatTile label="Interviews upcoming" tone="info" value={isPending ? '—' : data.interviewsUpcoming} />
      </div>

      {/* Placed against unplaced is one proportion, so it is one bar, not a pie. */}
      <section className="mt-8 rounded-xl border border-line bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Placed against unplaced
        </h2>
        {!isPending && (
          <>
            <div className="mt-3 flex h-6 w-full overflow-hidden rounded-lg bg-track">
              <div
                className="h-full"
                style={{ width: `${placement.rate}%`, background: c.series1 }}
                role="img"
                aria-label={`${placement.placed} of ${placement.total} students placed`}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full" style={{ background: c.series1 }} aria-hidden />
                Placed <span className="font-medium tabular-nums text-ink">{placement.placed}</span>
              </span>
              <span className="flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full bg-muted" aria-hidden />
                Unplaced <span className="font-medium tabular-nums text-ink">{placement.unplaced}</span>
              </span>
            </div>
          </>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Applications and offers, by week
        </h2>
        <p className="mt-0.5 text-sm text-muted">Last eight weeks.</p>

        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.weekly ?? []} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
              {/* Recessive grid: horizontal only, so it reads as a reference not a cage. */}
              <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={weekLabel}
                tick={{ fill: c.muted, fontSize: 12 }}
                axisLine={{ stroke: c.line }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: c.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.line, strokeWidth: 1 }} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 13, color: c.muted, paddingTop: 8 }}
              />
              {/* Both series are counts, so they share one axis. Never two scales. */}
              <Line
                type="monotone"
                dataKey="applications"
                name="Applications"
                stroke={c.series1}
                strokeWidth={2}
                dot={{ r: 4, fill: c.series1, stroke: c.card, strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: c.card, strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="offers"
                name="Offers"
                stroke={c.series2}
                strokeWidth={2}
                dot={{ r: 4, fill: c.series2, stroke: c.card, strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: c.card, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* One series, so no legend: the heading names it and each bar is labelled. */}
      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Applications by stage
        </h2>
        <dl className="mt-4 space-y-2.5">
          {STATUS_ORDER.map((status) => {
            const n = byStatus[status] ?? 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <dt className="w-28 shrink-0 text-sm text-muted">{STATUS_LABEL[status]}</dt>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-track">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(n / maxStatus) * 100}%`, background: c.bars }}
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
