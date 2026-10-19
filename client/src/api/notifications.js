import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => api('/notifications', { signal }),
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
