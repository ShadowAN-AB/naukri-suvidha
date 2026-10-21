import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { registerSchema, fieldErrors, BRANCHES, CURRENT_BATCH_YEARS, ROLES, HOME_FOR_ROLE } from '@nexus/shared';

import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';

export default function Register() {
  const { user, ready, register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState(ROLES.STUDENT);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={HOME_FOR_ROLE[user.role] ?? '/'} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const raw = { ...Object.fromEntries(new FormData(e.currentTarget)), role };
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const created = await register(parsed.data);
      navigate(HOME_FOR_ROLE[created.role] ?? '/', { replace: true });
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Placement office accounts are created by the office, not here.
        </p>

        <div className="mt-6 flex gap-2" role="tablist" aria-label="Account type">
          {[
            [ROLES.STUDENT, 'I am a student'],
            [ROLES.RECRUITER, 'I am a recruiter'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={role === value}
              onClick={() => {
                setRole(value);
                setErrors({});
                setFormError(null);
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                role === value
                  ? 'border-accent bg-accent-soft text-accent-strong'
                  : 'border-line bg-card text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          {formError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          )}

          <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            error={errors.password}
            hint="At least 8 characters, with a letter and a number."
            required
          />

          {role === ROLES.STUDENT ? (
            <>
              <Field label="Full name" name="name" autoComplete="name" error={errors.name} required />
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="Roll number" name="rollNo" error={errors.rollNo} required />
                <Field label="Branch" name="branch" as="select" error={errors.branch} defaultValue="" required>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <Field label="Batch" name="batchYear" as="select" error={errors.batchYear} defaultValue={CURRENT_BATCH_YEARS[0]} required>
                  {CURRENT_BATCH_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Field>
                <Field label="CGPA" name="cgpa" type="number" step="0.01" min="0" max="10" error={errors.cgpa} required />
                <Field label="Backlogs" name="backlogs" type="number" min="0" defaultValue={0} error={errors.backlogs} />
              </div>
            </>
          ) : (
            <>
              <Field label="Company name" name="companyName" error={errors.companyName} required />
              <Field label="Website" name="website" type="url" placeholder="https://" error={errors.website} />
              <Field label="Industry" name="industry" error={errors.industry} />
            </>
          )}

          <Button variant="primary" size="md" className="w-full"
            type="submit"
            disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>

      <p className="mt-6 text-sm text-muted">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
