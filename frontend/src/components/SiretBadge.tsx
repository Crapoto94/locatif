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
