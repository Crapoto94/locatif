import { ExternalLink } from 'lucide-react';
import { Badge } from './ui';
import { dateFr } from '../lib/format';

const ETATS: Record<string, [string, 'success' | 'warn' | 'error' | 'muted']> = {
  paye: ['Payé', 'success'], a_payer: ['À payer', 'warn'], non_pris_en_charge: ['Non pris en charge', 'muted'], rejete: ['Rejeté', 'error'], suspendu: ['Suspendu', 'warn'],
};

// Retard d'un titre non payé, en jours depuis son émission.
const retard = (e: any) => (e.titre_date ? Math.round((Date.now() - new Date(e.titre_date).getTime()) / 86400000) : 0);

// Titre de recette SEDIT d'une échéance titrée : numéro cliquable (fiche dans SEDIT) et état de paiement. « probable » = rapprochement moins certain.
// SEDIT ne donne que la date de paiement, pas le montant encaissé : un paiement partiel n'apparaît pas.
export default function TitreLink({ e }: { e: any }) {
  if (!e?.titre_numero) return <span className="text-outline">—</span>;
  const titre = `Titre n° ${e.titre_numero} (exercice ${e.titre_exercice}) du ${dateFr(e.titre_date)}${e.titre_bordereau ? ` — bordereau ${e.titre_bordereau}` : ''}`;
  const etat = e.titre_etat ? ETATS[e.titre_etat] : null;
  const enRetard = e.titre_etat && e.titre_etat !== 'paye' && e.titre_etat !== 'rejete' && retard(e) > 60;
  return (
    <div className="flex flex-col gap-0.5" title={titre}>
      <span className="inline-flex items-center gap-1 flex-wrap">
        {e.titre_url
          ? <a href={e.titre_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-secondary font-semibold hover:underline tabular-nums">{e.titre_numero}<ExternalLink size={12} /></a>
          : <span className="font-semibold tabular-nums">{e.titre_numero}</span>}
        <span className="text-[11px] text-on-surface-variant">/ {e.titre_exercice} • {dateFr(e.titre_date)}</span>
        {e.titre_confiance === 'probable' && <Badge tone="warn">probable</Badge>}
      </span>
      {etat && (
        <span className="inline-flex items-center gap-1 flex-wrap">
          <Badge tone={enRetard ? 'error' : etat[1]}>{etat[0]}{e.titre_etat === 'paye' && e.titre_paiement_le ? ` le ${dateFr(e.titre_paiement_le)}` : ''}</Badge>
          {enRetard && <span className="text-[11px] text-error">{retard(e)} j depuis le titre</span>}
        </span>
      )}
    </div>
  );
}
