/**
 * The single definition of whether a student may apply to a job.
 *
 * This is a pure function with no database and no imports from either side, so
 * the server can enforce it on the list query and again on apply, and the
 * client can explain a greyed-out button without a round trip. There is only
 * one copy of these rules, which is the point: a rule that exists twice
 * eventually disagrees with itself.
 *
 * Enforcement always happens on the server. The client calling this is a
 * courtesy to the user, never a substitute.
 */

export const ELIGIBILITY = Object.freeze({
  CGPA: 'cgpa',
  BACKLOGS: 'backlogs',
  BRANCH: 'branch',
  DEADLINE: 'deadline',
  NOT_OPEN: 'not_open',
});

/**
 * @param {{ cgpa:number, backlogs:number, branch:string }} student
 * @param {{ minCgpa:number, maxBacklogs:number, allowedBranches:string[], deadline:string|Date, status:string }} job
 * @param {{ now?: Date }} [opts]
 * @returns {{ eligible: boolean, failures: Array<{ rule: string, message: string }> }}
 */
export function checkEligibility(student, job, { now = new Date() } = {}) {
  const failures = [];

  if (job.status !== 'approved') {
    failures.push({ rule: ELIGIBILITY.NOT_OPEN, message: 'This job is not open for applications' });
  }

  if (job.deadline && new Date(job.deadline) < now) {
    failures.push({ rule: ELIGIBILITY.DEADLINE, message: 'The deadline for this job has passed' });
  }

  const minCgpa = job.minCgpa ?? 0;
  if (Number(student.cgpa) < minCgpa) {
    failures.push({
      rule: ELIGIBILITY.CGPA,
      message: `Requires a CGPA of ${minCgpa}; yours is ${student.cgpa}`,
    });
  }

  const maxBacklogs = job.maxBacklogs ?? 0;
  if (Number(student.backlogs ?? 0) > maxBacklogs) {
    failures.push({
      rule: ELIGIBILITY.BACKLOGS,
      message:
        maxBacklogs === 0
          ? 'Requires no active backlogs'
          : `Allows at most ${maxBacklogs} backlogs; you have ${student.backlogs}`,
    });
  }

  // An empty list means every branch is welcome.
  const branches = job.allowedBranches ?? [];
  if (branches.length > 0 && !branches.includes(student.branch)) {
    failures.push({
      rule: ELIGIBILITY.BRANCH,
      message: `Open to ${branches.join(', ')}; you are in ${student.branch}`,
    });
  }

  return { eligible: failures.length === 0, failures };
}

/**
 * The same rules expressed as a MongoDB filter, so a student's job list is
 * narrowed in the database rather than fetched and filtered in memory.
 *
 * It must agree with checkEligibility above. The jobs test asserts that it
 * does, by running both over the same data.
 */
export function eligibilityFilter(student, { now = new Date() } = {}) {
  return {
    status: 'approved',
    deadline: { $gte: now },
    minCgpa: { $lte: Number(student.cgpa) },
    maxBacklogs: { $gte: Number(student.backlogs ?? 0) },
    $or: [{ allowedBranches: { $size: 0 } }, { allowedBranches: student.branch }],
  };
}
