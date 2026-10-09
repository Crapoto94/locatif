import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileOutput, Eye, Download, FolderOpen, AlertOctagon } from 'lucide-react';
import { api, errMsg, fileUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { eur, dateTimeFr, moisLabel } from '../lib/format';
import { Card, Btn, Badge, Modal, Notice, SectionTitle, toast } from './ui';

// Facturation de fin de campagne : fichier FILIEN + pièces jointes déposés dans un dossier. Une fois déposé,
// la facturation est considérée comme réalisée (échéances « émises »). Paramétrage : /admin/filien.
export default function FilienPanel({ periode, c, onDone }: { periode: string; c: any; onDone: () => void }) {
  const { can } = useAuth();
  const [apercu, setApercu] = useState<any | null>(null); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const validee = c.statut === 'validee'; const facturee = Boolean(c.facturee_le);

  const charger = async () => {
    setBusy(true);
    try { setApercu((await api.get(`/filien/campagne/${periode}/apercu`)).data); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const generer = async () => {
    setBusy(true);
    try { const r = (await api.post(`/filien/campagne/${periode}/generer`)).data; toast(`FILIEN généré : ${r.nb_mouvements} titre(s) déposé(s)`); setConfirm(false); setApercu(null); onDone(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const bloque = apercu && (apercu.erreurs.length > 0 || apercu.parametrage.length > 0 || apercu.nb_mouvements === 0);

  return (
    <Card className="mt-space-md">
      <SectionTitle icon={<FileOutput size={18} />} title="Facturation FILIEN (SEDIT)" sub="Un titre de recette par échéance, déposé avec ses pièces dans un dossier ; le dépôt vaut facturation réalisée." />
      {facturee ? (
        <div className="flex flex-col gap-space-sm">
          <Notice tone="success"><strong>Facturation réalisée</strong> le {dateTimeFr(c.facturee_le)} par {c.facturee_par} — les échéances de la campagne sont « émises ».</Notice>
          {c.filien && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-sm text-body-md">
              <div><span className="text-on-surface-variant">Titres : </span><strong>{c.filien.nb_mouvements}</strong> ({c.filien.premier_mouvement} → {c.filien.dernier_mouvement}) — <strong>{eur(c.filien.total)}</strong> — {c.filien.nb_pj} pièce(s) jointe(s)</div>
              <div className="flex items-start gap-1 min-w-0"><FolderOpen size={16} className="mt-0.5 flex-shrink-0 text-secondary" /><span className="break-all">{c.filien.dossier}</span></div>
              <div className="flex gap-space-sm">
                <a href={fileUrl(`/filien/exports/${c.filien.id}/fichier`)} className="h-8 px-space-sm rounded text-label-md inline-flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-container-highest"><Download size={14} />{c.filien.fichier}</a>
                {can('filien.read') && <Link to="/admin/filien" className="h-8 px-space-sm rounded text-label-md inline-flex items-center text-secondary hover:bg-surface-container-low">Historique des exports</Link>}
              </div>
            </div>)}
        </div>
      ) : !validee ? (
        <Notice>La génération FILIEN devient disponible après la <strong>validation locative</strong> de la campagne. Vous pouvez déjà en consulter l'aperçu.</Notice>
      ) : null}
      {!facturee && (
        <div className="flex gap-space-sm mt-space-sm">
          {can('filien.read') && <Btn icon={<Eye size={16} />} disabled={busy} onClick={charger}>Aperçu du fichier FILIEN</Btn>}
          {can('filien.generer') && validee && <Btn variant="primary" icon={<FileOutput size={16} />} disabled={busy} onClick={async () => { await charger(); setConfirm(true); }}>Générer FILIEN et facturer</Btn>}
        </div>)}

      {apercu && (
        <Modal wide title={`Aperçu FILIEN — ${moisLabel(periode)}`} onClose={() => { setApercu(null); setConfirm(false); }} footer={<>
          <Btn onClick={() => { setApercu(null); setConfirm(false); }}>Fermer</Btn>
          {confirm && <Btn variant="primary" disabled={busy || bloque} onClick={generer}>Confirmer la facturation de {apercu.nb_mouvements} titre(s) — {eur(apercu.total)}</Btn>}
        </>}>
          <div className="flex flex-wrap gap-x-space-lg gap-y-1 text-body-md">
            <span>Titres : <strong>{apercu.nb_mouvements}</strong></span><span>Total : <strong>{eur(apercu.total)}</strong></span><span>Pièces : <strong>{apercu.nb_pj}</strong></span><span>Exercice : <strong>{apercu.exercice}</strong></span>
            {apercu.premier_mouvement && <span>Mouvements : <strong>{apercu.premier_mouvement} → {apercu.dernier_mouvement}</strong></span>}
          </div>
          <div className="text-body-sm text-on-surface-variant break-all">Dépôt : {apercu.dossier}</div>
          {apercu.parametrage.length > 0 && <Notice tone="error"><strong>Paramétrage FILIEN incomplet</strong> (<Link className="underline" to="/admin/filien">le compléter</Link>) :<ul className="list-disc ml-4">{apercu.parametrage.map((p: string) => <li key={p}>{p}</li>)}</ul></Notice>}
          {apercu.erreurs.length > 0 && <Notice tone="error"><strong>{apercu.erreurs.length} anomalie(s) à corriger</strong> (ou retirer l'échéance de la campagne) avant de générer :
            <ul className="mt-1 max-h-40 overflow-y-auto">{apercu.erreurs.map((e: any, i: number) => <li key={i} className="flex gap-1"><AlertOctagon size={13} className="mt-0.5 flex-shrink-0" /><span><strong>{e.contrat}</strong> — {e.message}</span></li>)}</ul></Notice>}
          {apercu.infos.length > 0 && <Notice>{apercu.infos.length} échéance(s) non reprise(s) : {apercu.infos.slice(0, 5).map((e: any) => `${e.contrat} (${e.message})`).join(' ; ')}{apercu.infos.length > 5 ? '…' : ''}</Notice>}
          {apercu.mouvements.length > 0 && (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-body-sm border-collapse"><thead><tr className="text-label-sm uppercase text-on-surface-variant bg-surface-container-high"><th className="text-left p-1">Mouvement</th><th className="text-left p-1">Contrat</th><th className="text-left p-1">Tiers SEDIT</th><th className="text-left p-1">Débiteur</th><th className="text-right p-1">Lignes</th><th className="text-right p-1">Total</th></tr></thead>
                <tbody>{apercu.mouvements.map((m: any) => <tr key={m.id} className="border-b border-surface-container-low"><td className="p-1 tabular-nums">{m.id}</td><td className="p-1">{m.contrat}</td><td className="p-1">{m.tiers}</td><td className="p-1">{m.contractant}</td>
                  <td className="p-1 text-right">{m.lignes.map((l: any) => <Badge key={l.libelle} className="ml-1">{l.libelle.split(' ')[0]} {eur(l.montant)}</Badge>)}</td><td className="p-1 text-right font-semibold tabular-nums">{eur(m.total)}</td></tr>)}</tbody></table>
            </div>)}
          <details><summary className="cursor-pointer text-secondary text-body-md">Contenu du fichier .filien.txt</summary>
            <pre className="mt-1 max-h-72 overflow-auto bg-surface-container-low rounded p-space-sm text-[11px] leading-snug">{apercu.contenu}</pre></details>
        </Modal>)}
    </Card>
  );
}
