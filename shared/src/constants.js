/** Values the client and the server must agree on, letter for letter. */

export const ROLES = Object.freeze({
  STUDENT: 'student',
  RECRUITER: 'recruiter',
  ADMIN: 'admin',
});
export const ROLE_VALUES = Object.values(ROLES);

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE = Object.freeze({
  [ROLES.STUDENT]: '/dashboard/student',
  [ROLES.RECRUITER]: '/dashboard/recruiter',
  [ROLES.ADMIN]: '/dashboard/admin',
});

export const BRANCHES = Object.freeze(['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL']);

export const CURRENT_BATCH_YEARS = Object.freeze([2026, 2027, 2028, 2029]);
