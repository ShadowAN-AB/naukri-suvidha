import { useMe } from '../../api/auth.js';
import PhaseNotice from '../../components/PhaseNotice.jsx';

export default function RecruiterDashboard() {
  const { data, isPending } = useMe();
  const company = data?.profile;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isPending ? 'Welcome' : (company?.name ?? 'Your company')}
      </h1>
      <p className="mt-1 text-muted">Recruiter dashboard.</p>

      {company && (
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-line bg-white p-5 text-sm sm:grid-cols-3">
          {[
            ['Industry', company.industry || '—'],
            ['Website', company.website || '—'],
            ['Verified', company.verified ? 'Yes' : 'Awaiting the placement office'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="mt-0.5 truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <PhaseNotice phase={3}>
        Posting jobs, watching them through the approval queue, and working a shortlist
        ordered by fit score.
      </PhaseNotice>
    </>
  );
}
