import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, fieldErrors, HOME_FOR_ROLE } from '@naukri-suvidha/shared';

import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';

export default function Login() {
  useDocumentTitle('Sign in');

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
    <AuthLayout maxWidth="max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to Naukri Suvidha</h1>
      <p className="mt-1 text-sm text-muted">Campus placement portal.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
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
          autoComplete="current-password"
          error={errors.password}
          required
        />

        <Button variant="primary" size="md" className="w-full"
          type="submit"
          disabled={busy}>
          {busy ? 'Signing in\u2026' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        New here?{' '}
        <Link to="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
