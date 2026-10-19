import { AppError } from '../../middleware/error.js';
import { ROLES } from '../../lib/constants.js';
import { Student, Company } from './model.js';

/** The profile belonging to the signed-in user, whichever kind it is. */
export async function getMyProfile(user) {
  if (user.role === ROLES.STUDENT) {
    const profile = await Student.findOne({ userId: user.id }).lean();
    if (!profile) throw AppError.notFound('Your student profile is missing');
    return { kind: 'student', profile };
  }
  if (user.role === ROLES.RECRUITER) {
    const profile = await Company.findOne({ userId: user.id }).lean();
    if (!profile) throw AppError.notFound('Your company profile is missing');
    return { kind: 'company', profile };
  }
  // An admin has no profile row; the account itself is the whole record.
  return { kind: 'admin', profile: null };
}

export async function updateMyProfile(user, patch) {
  if (user.role === ROLES.ADMIN) {
    throw AppError.forbidden('Admin accounts have no profile to edit');
  }

  const Model = user.role === ROLES.STUDENT ? Student : Company;
  const profile = await Model.findOneAndUpdate(
    { userId: user.id },
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();

  if (!profile) throw AppError.notFound('Your profile is missing');
  return { kind: user.role === ROLES.STUDENT ? 'student' : 'company', profile };
}
