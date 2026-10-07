import { ExternalLink } from 'lucide-react';
import { Badge } from './ui';
import { dateFr } from '../lib/format';

// Fiche publique de l'établissement (Annuaire des entreprises, adossé à la base Sirene). Modifiable au build : VITE_SIRENE_URL.
const BASE = ((import.meta.env.VITE_SIRENE_URL as string | undefined) || 'https://annuaire-entreprises.data.gouv.fr/etablissement').replace(/\/$/, '');
export const sireneUrl = (siret: string) => `${BASE}/${siret}`;

// SIRET avec son état de vérification auprès de Sirene : actif, fermé (date, lien vers Sirene), introuvable ; vide si aucun SIRET.
export function SiretBadge({ siret, statut, fermeture }: { siret?: string | null; statut?: string | null; fermeture?: string | null }) {
  if (!siret) return <span className="text-outline">—</span>;
  const lien = (tone: 'error' | 'warn', texte: string) => (
    <a href={sireneUrl(siret)} target="_blank" rel="noopener noreferrer" title="Voir la fiche de l'établissement sur le site Sirene">
      <Badge tone={tone} className="inline-flex items-center gap-1 hover:underline">{texte}<ExternalLink size={11} /></Badge>
    </a>
  );
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="tabular-nums">{siret}</span>
      {statut === 'actif' && <Badge tone="success">actif</Badge>}
      {statut === 'ferme' && lien('error', `fermé${fermeture ? ` le ${dateFr(fermeture)}` : ''}`)}
      {statut === 'introuvable' && lien('warn', 'introuvable')}
      {statut === 'erreur' && <Badge tone="muted">non vérifié</Badge>}
    </span>
  );
}

// Un SIRET fermé ne signifie pas que l'entreprise a disparu : on distingue la fermeture d'un établissement (l'entreprise continue,
// souvent avec un nouveau siège) de la cessation de l'unité légale (SIREN), et le cas d'une entreprise sans plus aucun établissement ouvert.
export function natureSiret(x: any): { texte: string; tone: 'error' | 'warn' | 'info' } | null {
  if (!x?.siren_etat) return null;
  if (x.siren_etat === 'cessee') return { tone: 'error', texte: `Entreprise cessée${x.siren_cessation_le ? ` le ${dateFr(x.siren_cessation_le)}` : ''} (SIREN fermé)` };
  if (x.etablissements_ouverts === 0) return { tone: 'warn', texte: "Entreprise toujours active mais sans aucun établissement ouvert : cessation probable, à surveiller" };
  return { tone: 'info', texte: `Seul l'établissement est fermé — l'entreprise reste active (${x.etablissements_ouverts ?? '?'} établissement(s) ouvert(s))` };
}

export function NatureSiret({ x }: { x: any }) {
  const n = natureSiret(x); if (!n) return null;
  return (
    <div className="text-body-sm">
      <Badge tone={n.tone}>{n.texte}</Badge>
      {x.siege_siret && x.siege_siret !== x.siret && x.siren_etat === 'active' && (
        <span className="ml-1 text-on-surface-variant">Siège actuel : <a className="text-secondary hover:underline" target="_blank" rel="noopener noreferrer" href={sireneUrl(x.siege_siret)}>{x.siege_siret}</a>{x.siege_adresse ? ` — ${x.siege_adresse}` : ''}</span>
      )}
    </div>
  );
}
