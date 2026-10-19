import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, setAccessToken, setSessionLostHandler, bootstrapSession } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // A reload loses the in-memory access token but keeps the refresh cookie,
  // so the session is rebuilt once before anything else renders.
  useEffect(() => {
    let cancelled = false;
    setSessionLostHandler(() => clearSession());

    bootstrapSession()
      .then((data) => {
        if (!cancelled && data?.user) setUser(data.user);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (credentials) => {
    const data = await api('/auth/login', { method: 'POST', body: credentials });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input) => {
    const data = await api('/auth/register', { method: 'POST', body: input });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, ready, login, register, logout }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
