import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

/** Proves the client, the proxy, the server and the database are all wired up. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api('/health', { signal }),
    refetchInterval: 10_000,
    retry: false,
  });
}
