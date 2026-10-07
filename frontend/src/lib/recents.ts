// Éléments récemment consultés (barre supérieure) — pur confort, propre à chaque navigateur.
const KEY = 'locatif.recents';
export interface Recent { to: string; label: string }

export const getRecents = (): Recent[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};
export const trackRecent = (r: Recent) => {
  try {
    const list = [r, ...getRecents().filter((x) => x.to !== r.to)].slice(0, 6);
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('locatif:recents'));
  } catch { /* stockage indisponible */ }
};
