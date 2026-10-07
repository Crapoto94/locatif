import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from './api';

// Chargement GET avec états loading / error et rechargement manuel.
export function useFetch<T = any>(url: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([url, params]);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) { setData(null); setLoading(false); return; }
    const n = ++seq.current;
    setLoading(true); setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
      const r = await api.get(url, { params: clean });
      if (n === seq.current) setData(r.data);
    } catch (e) {
      if (n === seq.current) setError(errMsg(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

// Valeur « temporisée » (recherche au fil de la frappe).
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
