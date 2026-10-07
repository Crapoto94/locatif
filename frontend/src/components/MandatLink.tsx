import { ExternalLink } from 'lucide-react';
import { Badge } from './ui';
import { dateFr } from '../lib/format';

// Numéro de mandat SEDIT d'une échéance mandatée : cliquable vers la fiche mandat dans SEDIT. « probable » = rapprochement moins certain.
export default function MandatLink({ e }: { e: any }) {
  if (!e?.mandat_numero) return <span className="text-outline">—</span>;
  const titre = `Mandat n° ${e.mandat_numero} (exercice ${e.mandat_exercice}) du ${dateFr(e.mandat_date)}${e.mandat_bordereau ? ` — bordereau ${e.mandat_bordereau}` : ''}`;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap" title={titre}>
      {e.mandat_url
        ? <a href={e.mandat_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-secondary font-semibold hover:underline tabular-nums">{e.mandat_numero}<ExternalLink size={12} /></a>
        : <span className="font-semibold tabular-nums">{e.mandat_numero}</span>}
      <span className="text-[11px] text-on-surface-variant">/ {e.mandat_exercice} • {dateFr(e.mandat_date)}</span>
      {e.mandat_confiance === 'probable' && <Badge tone="warn">probable</Badge>}
    </span>
  );
}
