import { Badge } from './ui';
import { dateFr } from '../lib/format';

// SIRET avec son état de vérification auprès de Sirene : actif, fermé (date), introuvable ; vide si aucun SIRET.
export function SiretBadge({ siret, statut, fermeture }: { siret?: string | null; statut?: string | null; fermeture?: string | null }) {
  if (!siret) return <span className="text-outline">—</span>;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="tabular-nums">{siret}</span>
      {statut === 'actif' && <Badge tone="success">actif</Badge>}
      {statut === 'ferme' && <Badge tone="error">fermé{fermeture ? ` le ${dateFr(fermeture)}` : ''}</Badge>}
      {statut === 'introuvable' && <Badge tone="warn">introuvable</Badge>}
      {statut === 'erreur' && <Badge tone="muted">non vérifié</Badge>}
    </span>
  );
}
