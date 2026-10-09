import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import { dateFr } from '../lib/format';
import { Modal, Loading } from './ui';

// Numéro de version (0.N : +1 à chaque commit, voir backend/scripts/bump-version.js) et fenêtre « Nouveautés ».
export default function VersionBadge() {
  const { data } = useFetch<{ version: string; historique: { version: string; date: string; titre: string; notes: string }[] }>('/version');
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} title="Voir les nouveautés" className="flex items-center gap-1 text-label-sm text-secondary hover:underline self-start">
        <Sparkles size={12} />Version {data.version} — Nouveautés
      </button>
      {open && (
        <Modal wide title={`Nouveautés — version ${data.version}`} onClose={() => setOpen(false)}>
          {!data.historique ? <Loading /> : <ul className="flex flex-col gap-space-md max-h-[60vh] overflow-y-auto">
            {data.historique.map((h) => (
              <li key={h.version} className="border-l-2 border-secondary pl-space-sm">
                <div className="flex items-baseline gap-2"><span className="font-bold text-primary">v{h.version}</span><span className="text-body-sm text-on-surface-variant">{dateFr(h.date)}</span></div>
                <div className="text-body-md font-semibold">{h.titre}</div>
                {h.notes && <p className="text-body-sm text-on-surface-variant whitespace-pre-line">{h.notes}</p>}
              </li>))}
          </ul>}
        </Modal>)}
    </>
  );
}
