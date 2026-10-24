import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setOnAuthLost } from './api';
import { resetRealtimeIdentity } from './realtime';
import type { Role, User } from './types';

/** Test mode: skip login (set VITE_SKIP_LOGIN=true in frontend/.env). Never on in production builds. */
export const SKIP_LOGIN = import.meta.env.DEV && import.meta.env.VITE_SKIP_LOGIN === 'true';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (data: { accessToken: string; user: User }) => void;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  switchRole: (role: Role) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    setOnAuthLost(() => setUser(null));
    // Restore the session from the httpOnly refresh cookie on page load.
    refreshSession()
      .then(async (ok) => {
        if (ok) {
          setUser((await api.get<{ user: User }>('/auth/me')).user);
          resetRealtimeIdentity();
        } else if (SKIP_LOGIN) {
          const data = await api.post<{ accessToken: string; user: User }>('/auth/dev-login', { role: 'CUSTOMER' });
          setAccessToken(data.accessToken);
          setUser(data.user);
          resetRealtimeIdentity();
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback((data: { accessToken: string; user: User }) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    resetRealtimeIdentity();
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    resetRealtimeIdentity();
    qc.clear();
  }, [qc]);

  const switchRole = useCallback(
    async (role: Role) => {
      const data = await api.post<{ accessToken: string; user: User }>('/auth/dev-login', { role });
      qc.clear();
      signIn(data);
    },
    [qc, signIn],
  );

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, setUser, switchRole }),
    [user, loading, signIn, signOut, switchRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
