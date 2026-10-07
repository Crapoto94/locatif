import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { Modal, Btn, Badge, Loading, Notice, toast } from './ui';

const norm = (s?: string | null) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1);

// Décision sur un rapprochement SEDIT ambigu : on compare le contractant (ASTECH / application) aux tiers SEDIT candidats.
export default function TiersSeditModal({ contractantId, onClose, onDone }: { contractantId: number; onClose: () => void; onDone: () => void }) {
  const { data: c, loading } = useFetch<any>(`/contractants/${contractantId}`);
  const [busy, setBusy] = useState(false);

  const candidats = useMemo(() => {
    if (!c) return [];
    const mots = new Set(norm(`${c.nom} ${c.prenom || ''}`));
    return (c.tiers_sedit_candidats || []).map((k: any) => {
      const m = norm(k.nom); const communs = m.filter((w) => mots.has(w)).length;
      return { ...k, ressemblance: mots.size ? Math.round((communs / Math.max(mots.size, m.length || 1)) * 100) : 0, memeSiret: Boolean(c.siret && k.siret && c.siret === k.siret) };
    }).sort((a: any, b: any) => b.ressemblance - a.ressemblance || Number(b.memeSiret) - Number(a.memeSiret));
  }, [c]);

  const decider = async (body: any) => {
    setBusy(true);
    try { await api.post(`/contractants/${contractantId}/tiers-sedit`, body); toast(body.aucun ? 'Marqué : aucun tiers SEDIT ne correspond' : 'Tiers SEDIT enregistré'); onDone(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Rapprochement SEDIT à trancher" wide onClose={onClose} footer={<><Btn onClick={onClose}>Plus tard</Btn><Btn variant="danger" disabled={busy || loading} onClick={() => decider({ aucun: true })}>Aucun ne correspond</Btn></>}>
      {loading || !c ? <Loading /> : (
        <>
          <div className="bg-surface-container-low rounded-lg p-space-md">
            <div className="text-label-sm uppercase tracking-wider text-on-surface-variant mb-1">Contractant à rapprocher</div>
            <div className="text-headline-sm text-primary font-bold">{c.nom}{c.prenom ? ` ${c.prenom}` : ''}</div>
            <div className="text-body-md text-on-surface-variant flex flex-wrap gap-x-space-lg gap-y-0.5 mt-1">
              <span>SIRET : <strong className="text-on-surface tabular-nums">{c.siret || '—'}</strong></span>
              <span>Code tiers ASTECH : <strong className="text-on-surface">{c.astech_tiers_cod || '—'}</strong></span>
              <span>Adresse : <strong className="text-on-surface">{[c.adresse, c.code_postal, c.ville].filter(Boolean).join(' ') || '—'}</strong></span>
              <span>{c.contrats?.length || 0} contrat(s)</span>
            </div>
          </div>
          <Notice tone="warn">{c.tiers_sedit_note || 'Plusieurs tiers SEDIT peuvent correspondre.'} Choisissez le tiers à rattacher : cette décision est conservée (la reprise automatique ne la modifiera plus) et tracée dans l'audit.</Notice>
          <div className="flex flex-col gap-space-sm">
            {candidats.length === 0 && <div className="text-on-surface-variant">Aucun candidat enregistré : relancez le rapprochement.</div>}
            {candidats.map((k: any) => (
              <div key={k.code} className={`rounded-lg p-space-md flex items-center justify-between gap-space-md ${k.memeSiret && k.ressemblance >= 60 ? 'bg-[#e1f4e7]' : 'bg-surface-container-low'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-primary">{k.nom}</strong>
                    {k.sedit_url ? <a href={k.sedit_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-secondary font-semibold hover:underline tabular-nums" title="Ouvrir le tiers dans SEDIT">{k.code}<ExternalLink size={12} /></a> : <span className="tabular-nums">{k.code}</span>}
                  </div>
                  <div className="text-body-sm text-on-surface-variant flex items-center gap-2 flex-wrap mt-0.5">
                    <span>SIRET SEDIT : <span className="tabular-nums">{k.siret || '—'}</span></span>
                    {k.memeSiret ? <Badge tone="success">SIRET identique</Badge> : c.siret && k.siret ? <Badge tone="warn">SIRET différent</Badge> : null}
                    <Badge tone={k.ressemblance >= 80 ? 'success' : k.ressemblance >= 40 ? 'info' : 'muted'}>nom {k.ressemblance} % proche</Badge>
                  </div>
                </div>
                <Btn variant="primary" size="sm" disabled={busy} onClick={() => decider({ code: k.code })}>Choisir ce tiers</Btn>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
