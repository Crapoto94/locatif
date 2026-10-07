import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export interface RefValue { code: string; libelle: string; meta?: Record<string, unknown> }
type Refs = Record<string, RefValue[]>;

const Ctx = createContext<{ refs: Refs; reload: () => void }>({ refs: {}, reload: () => {} });

// Référentiels métier chargés une fois pour les listes déroulantes et les libellés.
export function RefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [refs, setRefs] = useState<Refs>({});
  const [n, setN] = useState(0);
  useEffect(() => { if (user) api.get('/referentiels/toutes').then((r) => setRefs(r.data)).catch(() => {}); }, [user, n]);
  return <Ctx.Provider value={{ refs, reload: () => setN((x) => x + 1) }}>{children}</Ctx.Provider>;
}

export const useRefs = () => useContext(Ctx);
export const useRefList = (domaine: string) => useContext(Ctx).refs[domaine] || [];
export function useLabel() {
  const { refs } = useContext(Ctx);
  return (domaine: string, code?: string | null) => (code ? refs[domaine]?.find((r) => r.code === code)?.libelle || code : '—');
}
