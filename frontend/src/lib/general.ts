import { useEffect, useState } from 'react';
import { api, API_BASE } from './api';

// Paramètres généraux (nom de la ville de référence, logo) : cache partagé, rafraîchi après modification.
export interface General { ville_nom: string; logo: boolean; logo_version: number }
let cache: General = { ville_nom: "Ville d'Ivry-sur-Seine", logo: false, logo_version: 0 };
let chargé = false;
const subs = new Set<(g: General) => void>();
export const setGeneral = (g: General) => { cache = g; chargé = true; subs.forEach((f) => f(g)); };
export const logoUrl = (g: General) => (g.logo ? `${API_BASE}/general/logo?v=${g.logo_version}` : '/logo.jpg');

export function useGeneral(): General {
  const [g, setG] = useState(cache);
  useEffect(() => {
    subs.add(setG);
    if (!chargé) api.get('/general').then((r) => setGeneral(r.data)).catch(() => {});
    return () => { subs.delete(setG); };
  }, []);
  return g;
}
