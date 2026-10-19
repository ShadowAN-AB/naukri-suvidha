import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { connectSocket, disconnectSocket } from '../lib/socket.js';
import { useAuth } from './AuthContext.jsx';

const RealtimeContext = createContext({ connected: false });

/**
 * Keeps one socket alive for as long as someone is signed in, and turns the
 * events it receives into cache invalidations.
 *
 * The screens themselves know nothing about sockets: a push just marks the
 * relevant queries stale and TanStack Query refetches them. That keeps one
 * source of truth for the data and means every screen behaves the same whether
 * the socket is up or not.
 */
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      setConnected(false);
      return;
    }

    const socket = connectSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onNotification = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    const onApplicationStatus = () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
    };
    const onResumeProcessed = () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('notification:new', onNotification);
    socket.on('application:status', onApplicationStatus);
    socket.on('resume:processed', onResumeProcessed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('notification:new', onNotification);
      socket.off('application:status', onApplicationStatus);
      socket.off('resume:processed', onResumeProcessed);
    };
  }, [user, queryClient]);

  return <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);
