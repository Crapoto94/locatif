import axios from 'axios';

// L'URL du backend est injectée au build (VITE_API_URL) ; vide = même origine (proxy Vite / reverse-proxy).
const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
export const API_BASE = `${base}/api/v1`;

export const api = axios.create({ baseURL: API_BASE, timeout: 60000 });

const TOKEN_KEY = 'locatif.token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ } };

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
api.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401 && !String(e.config?.url).includes('/auth/login')) onUnauthorized?.();
  return Promise.reject(e);
});

// Message d'erreur lisible, tel que renvoyé par le backend ({ error }).
export const errMsg = (e: unknown): string => {
  const x = e as { response?: { data?: { error?: string } }; message?: string };
  return x.response?.data?.error || x.message || 'Erreur inattendue';
};

// URL d'un fichier à ouvrir dans le navigateur (le jeton passe en paramètre : les <a> n'envoient pas d'en-tête).
export const fileUrl = (path: string) => `${API_BASE}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken() || '')}`;
