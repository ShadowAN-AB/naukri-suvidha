import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

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
    queryFn: ({ signal }) => api('/ai/health', { signal }),
    refetchInterval: 15_000,
  });
}
