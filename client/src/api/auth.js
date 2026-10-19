import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

/** The signed-in user together with their student or company profile. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api('/auth/me', { signal }),
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: ({ signal }) => api('/admin/overview', { signal }),
  });
}
