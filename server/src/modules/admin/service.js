import { APPLICATION_STATUS, JOB_STATUS, PLACEMENT_STATUS } from '../../lib/constants.js';
import { Student, Company } from '../profiles/model.js';
import { Job } from '../jobs/model.js';
import { Application } from '../applications/model.js';
import { Interview } from '../interviews/model.js';
import { AuditLog } from './model.js';
import { User } from '../auth/model.js';
import { getCache } from '../../infra/cache/index.js';

const WEEKS = 8;

/*
 * Analytics is six aggregations over four collections, read by a dashboard
 * that several people refresh at once, and nobody needs it to the second. One
 * minute of staleness buys the database an enormous amount of quiet.
 *
 * The key carries no user in it because the figures are the same for every
 * admin. With Redis configured the cache is shared, so the first admin to
 * open the page pays for it and the rest do not - which is the difference
 * between a cache and a per-process one that each replica fills separately.
 */
const ANALYTICS_KEY = 'admin:analytics';
const ANALYTICS_TTL_SECONDS = 60;

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Monday-based, so a "week" matches how a placement cell talks about one.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

export async function overview() {
  const [students, companies, jobsPending, jobsApproved, users] = await Promise.all([
    Student.countDocuments(),
    Company.countDocuments(),
    Job.countDocuments({ status: JOB_STATUS.PENDING }),
    Job.countDocuments({ status: JOB_STATUS.APPROVED }),
    User.countDocuments(),
  ]);
  return { students, companies, jobsPending, jobsApproved, users };
}

export async function analytics() {
  const cache = getCache();
  const hit = await cache.get(ANALYTICS_KEY);
  if (hit) return { ...hit, cached: true };

  const since = startOfWeek(new Date());
  since.setDate(since.getDate() - (WEEKS - 1) * 7);

  const [placed, totalStudents, byStatus, offered, recent, interviews] = await Promise.all([
    Student.countDocuments({ placementStatus: PLACEMENT_STATUS.PLACED }),
    Student.countDocuments(),
    Application.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    // Offers joined to their job, which is where the CTC lives.
    Application.aggregate([
      { $match: { status: APPLICATION_STATUS.OFFERED } },
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      { $project: { ctcLpa: '$job.ctcLpa', updatedAt: 1 } },
    ]),
    Application.find({ appliedAt: { $gte: since } }).select('appliedAt status').lean(),
    Interview.countDocuments({ status: 'scheduled', scheduledAt: { $gte: new Date() } }),
  ]);

  const ctcs = offered.map((o) => o.ctcLpa).filter((n) => typeof n === 'number');

  // One bucket per week, pre-seeded so a quiet week shows as zero rather than
  // vanishing from the chart and making the trend look smoother than it was.
  const buckets = new Map();
  for (let i = 0; i < WEEKS; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i * 7);
    buckets.set(d.toISOString().slice(0, 10), { week: d.toISOString().slice(0, 10), applications: 0, offers: 0 });
  }
  for (const a of recent) {
    const key = startOfWeek(a.appliedAt).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.applications += 1;
    if (a.status === APPLICATION_STATUS.OFFERED) bucket.offers += 1;
  }

  const statuses = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));

  const result = {
    placement: {
      placed,
      unplaced: totalStudents - placed,
      total: totalStudents,
      rate: totalStudents ? Math.round((placed / totalStudents) * 100) : 0,
    },
    offers: {
      count: offered.length,
      medianCtcLpa: median(ctcs),
      highestCtcLpa: ctcs.length ? Math.max(...ctcs) : null,
    },
    applications: {
      total: Object.values(statuses).reduce((a, b) => a + b, 0),
      byStatus: statuses,
    },
    interviewsUpcoming: interviews,
    weekly: [...buckets.values()],
  };

  await cache.set(ANALYTICS_KEY, result, ANALYTICS_TTL_SECONDS);
  return { ...result, cached: false };
}

export async function auditLog({ limit = 50, actorId, action } = {}) {
  const filter = {};
  if (actorId) filter.actorId = actorId;
  if (action) filter.action = action;

  const items = await AuditLog.find(filter)
    .sort({ at: -1 })
    .limit(limit)
    .populate('actorId', 'email role')
    .lean();

  return { items };
}
