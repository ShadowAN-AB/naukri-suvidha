import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES, AI_TASK_STATUS } from '../../lib/constants.js';
import { env } from '../../config/env.js';
import { getLLM } from '../../infra/llm/index.js';
import { aiWorker } from './worker.js';
import { AiTask, FitScore } from './model.js';

const router = Router();

/**
 * Open, like /api/health: whether the AI layer is working is operational
 * information, and it deliberately reveals nothing about any person.
 */
router.get('/health', async (_req, res, next) => {
  try {
    const [provider, counts] = await Promise.all([
      getLLM().health(),
      AiTask.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    const tasks = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    const dead = tasks[AI_TASK_STATUS.DEAD] ?? 0;

    res.status(provider.ok ? 200 : 503).json({
      status: provider.ok ? 'ok' : 'degraded',
      // Scores are still produced without a model, just capped and flagged.
      degradedBehaviour: provider.ok ? null : 'Falling back to pattern matching; scores capped at 70.',
      provider: { name: env.LLM_PROVIDER, ...provider },
      queue: aiWorker.stats,
      tasks: { ...tasks, dead },
      scores: await FitScore.estimatedDocumentCount(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/tasks', requireAuth, requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const items = await AiTask.find(req.query.status ? { status: req.query.status } : {})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** Re-run scoring for everyone. Useful after changing a prompt. */
router.post('/rescore', requireAuth, requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { Student } = await import('../profiles/model.js');
    const students = await Student.find({ currentResumeId: { $ne: null } }).select('_id').lean();
    for (const s of students) await aiWorker.scoreStudentAgainstJobs(s._id);
    res.json({ queuedFor: students.length });
  } catch (err) {
    next(err);
  }
});

export default router;
