import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

export interface User {
  id: number; username: string; displayName: string | null; email: string | null; service: string | null;
  source: 'ad' | 'local'; profils: string[]; permissions: string[];
}

interface AuthCtx {
  user: User | null; loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) { setLoading(false); return; }
    api.get('/auth/me').then((r) => setUser(r.data)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.post('/auth/login', { username, password });
    setToken(r.data.token);
    setUser(r.data.user);
  }, []);

  const value = useMemo<AuthCtx>(() => ({ user, loading, login, logout, can: (p) => Boolean(user?.permissions.includes(p)) }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth hors AuthProvider');
  return c;
};
