import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

/**
 * The signed-in user's student or company profile.
 *
 * It used to come from /auth/me, which returned the user *and* the profile.
 * Authentication is its own service now and does not have the profile; the
 * user half was already in AuthContext from signing in, and the profile half
 * was always this endpoint's data. So this asks the service that owns it.
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api('/profiles/me', { signal }),
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: ({ signal }) => api('/admin/overview', { signal }),
  });
}
