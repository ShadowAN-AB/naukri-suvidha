import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: ({ signal }) => api('/profiles/me', { signal }),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/profiles/me', { method: 'PATCH', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Eligibility depends on the student's CGPA, backlogs and branch, so a
      // profile edit can change which jobs they qualify for.
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
