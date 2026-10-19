import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES } from '../../lib/constants.js';
import { User, Student, Company, Job } from '../../models.js';

const router = Router();

/**
 * The first admin-only endpoint. It exists in Phase 2 mainly so requireRole is
 * exercised by a real route rather than sitting unused until Phase 6, which is
 * also what makes "a student hitting an admin route gets 403" testable.
 */
router.get('/overview', requireAuth, requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const [students, companies, jobsPending, jobsApproved, users] = await Promise.all([
      Student.countDocuments(),
      Company.countDocuments(),
      Job.countDocuments({ status: 'pending' }),
      Job.countDocuments({ status: 'approved' }),
      User.countDocuments(),
    ]);
    res.json({ students, companies, jobsPending, jobsApproved, users });
  } catch (err) {
    next(err);
  }
});

export default router;
