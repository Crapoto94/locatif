export const eur = (n: number | string | null | undefined, dec = 2) =>
  n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`;

export const num = (n: number | string | null | undefined, dec = 0) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const dateFr = (s?: string | null) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(s);
};

export const dateTimeFr = (s?: string | null) => {
  if (!s) return '—';
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? String(s) : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

export const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const moisLabel = (p?: string | null) => {
  if (!p) return '—';
  const [y, m] = p.split('-');
  return `${MOIS[Number(m) - 1] ?? m} ${y}`;
};
export const currentPeriode = () => new Date().toISOString().slice(0, 7);
export const shiftPeriode = (p: string, delta: number) => {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export const bytes = (n?: number | null) => {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
};
