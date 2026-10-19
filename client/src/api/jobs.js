import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const key = (params) => ['jobs', params];

export function useJobs(params = {}) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false),
  ).toString();

  return useQuery({
    queryKey: key(params),
    queryFn: ({ signal }) => api(`/jobs${search ? `?${search}` : ''}`, { signal }),
  });
}

export function useJob(id) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: ({ signal }) => api(`/jobs/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

/** Every job mutation invalidates the same lists, so screens stay in step. */
function useJobMutation(fn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export const useCreateJob = () => useJobMutation((body) => api('/jobs', { method: 'POST', body }));
export const useUpdateJob = () =>
  useJobMutation(({ id, ...body }) => api(`/jobs/${id}`, { method: 'PATCH', body }));
export const useApproveJob = () => useJobMutation((id) => api(`/jobs/${id}/approve`, { method: 'POST' }));
export const useRejectJob = () =>
  useJobMutation(({ id, reason }) => api(`/jobs/${id}/reject`, { method: 'POST', body: { reason } }));
export const useCloseJob = () => useJobMutation((id) => api(`/jobs/${id}/close`, { method: 'POST' }));
