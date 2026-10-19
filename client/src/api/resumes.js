import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useMyResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: ({ signal }) => api('/resumes', { signal }),
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file) => {
      const body = new FormData();
      body.append('resume', file);
      // isFormData: the browser must set its own multipart boundary, so the
      // api helper has to leave Content-Type alone.
      return api('/resumes', { method: 'POST', body, isFormData: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      // Applying requires a resume on file, so the jobs list changes meaning
      // the moment the first one lands.
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
