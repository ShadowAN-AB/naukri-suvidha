import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useInterviews() {
  return useQuery({
    queryKey: ['interviews'],
    queryFn: ({ signal }) => api('/interviews', { signal }),
  });
}

function useInterviewMutation(fn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export const useScheduleInterview = () =>
  useInterviewMutation((body) => api('/interviews', { method: 'POST', body }));

export const useCancelInterview = () =>
  useInterviewMutation((id) => api(`/interviews/${id}/cancel`, { method: 'POST' }));
