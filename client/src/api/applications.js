import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useApplications(params = {}) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  ).toString();

  return useQuery({
    queryKey: ['applications', params],
    queryFn: ({ signal }) => api(`/applications${search ? `?${search}` : ''}`, { signal }),
  });
}

function useApplicationMutation(fn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export const useApply = () =>
  useApplicationMutation((jobId) => api('/applications', { method: 'POST', body: { jobId } }));

export const useChangeStatus = () =>
  useApplicationMutation(({ id, status, note }) =>
    api(`/applications/${id}/status`, { method: 'PATCH', body: { status, note } }),
  );

export const useWithdraw = () =>
  useApplicationMutation((id) => api(`/applications/${id}/withdraw`, { method: 'POST' }));
