import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

/**
 * One shared socket for the whole app. Events only say "something changed";
 * screens refetch over HTTP so the server's access checks still apply.
 * While the socket is down, screens poll instead (see usePollWhenOffline).
 */
let socket: Socket | null = null;
let connected = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function getSocket(): Socket {
  if (socket) return socket;
  const base: string = import.meta.env.VITE_API_URL || '/';
  socket = io(base, {
    path: '/socket.io',
    withCredentials: true,
    // Re-read the token on every (re)connect so a refreshed session is used.
    auth: (cb) => cb({ token: getAccessToken() }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  const set = (v: boolean) => () => {
    connected = v;
    notify();
  };
  socket.on('connect', set(true));
  socket.on('disconnect', set(false));
  socket.on('connect_error', set(false));
  return socket;
}

/** Reconnect so the server sees the new identity (after sign-in / sign-out). */
export function resetRealtimeIdentity() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

export function useRealtimeStatus(): boolean {
  getSocket();
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => connected,
  );
}

/** Subscribe to a socket event for the lifetime of the component. Pass a stable handler. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}

/** Join a shop's public queue room; re-joins after reconnects. */
export function useQueueRoom(shopId: string | null) {
  const online = useRealtimeStatus();
  useEffect(() => {
    if (shopId && online) getSocket().emit('queue:watch', shopId);
  }, [shopId, online]);
}

/** refetchInterval value: poll every 15s only while realtime is down. */
export function usePollWhenOffline(ms = 15_000): number | false {
  const online = useRealtimeStatus();
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    // Give the socket a moment to connect on first load before falling back.
    const t = setTimeout(() => setGrace(false), 4000);
    return () => clearTimeout(t);
  }, []);
  return online || grace ? false : ms;
}
