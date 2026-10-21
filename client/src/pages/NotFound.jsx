import { Link } from 'react-router-dom';

import AuthLayout from '../layouts/AuthLayout.jsx';
import Button from '../components/ui/Button.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

/**
 * An unknown URL used to redirect silently to `/`, which left people who had
 * mistyped or followed a stale link looking at a dashboard, with nothing to
 * say the address had been wrong.
 */
export default function NotFound() {
  useDocumentTitle('Page not found');

  return (
    <AuthLayout maxWidth="max-w-md">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted">Error 404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="mt-2 text-sm text-muted">
        The address may have been mistyped, or the posting it pointed at has since closed.
      </p>
      <Button as={Link} to="/" variant="primary" size="md" className="mt-6">
        Back to Nexus
      </Button>
    </AuthLayout>
  );
}
