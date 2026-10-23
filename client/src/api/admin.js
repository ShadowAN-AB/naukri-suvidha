import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.js';

export function useAnalytics() {
  return useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: ({ signal }) => api('/admin/analytics', { signal }),
  });
}

export function useAuditLog(limit = 50) {
  return useQuery({
    queryKey: ['admin', 'audit', limit],
    queryFn: ({ signal }) => api(`/admin/audit?limit=${limit}`, { signal }),
  });
}

export function useAiHealth() {
  return useQuery({
    queryKey: ['admin', 'ai-health'],
    /*
     * A degraded provider answers 503, and the body is the health report
     * rather than an error envelope. Treating that as a failure meant the
     * panel vanished in the one state it exists to describe - the Ollama-is-
     * down beat the demo depends on showed an empty space.
     */
    queryFn: async ({ signal }) => {
      try {
        return await api('/ai/health', { signal });
      } catch (err) {
        if (err instanceof ApiError && err.status === 503 && err.body) return err.body;
        throw err;
      }
    },
    retry: false,
    refetchInterval: 15_000,
  });
}
