import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, fieldErrors, HOME_FOR_ROLE } from '@nexus/shared';

import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';

export default function Login() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={HOME_FOR_ROLE[user.role] ?? '/'} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const signedIn = await login(parsed.data);
      const from = location.state?.from;
      navigate(from ?? HOME_FOR_ROLE[signedIn.role] ?? '/', { replace: true });
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-6 text-ink">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Nexus</h1>
        <p className="mt-1 text-sm text-muted">Campus placement portal.</p>

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            error={errors.password}
            required
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          New here?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
