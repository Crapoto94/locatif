import { useRef, useState } from 'react';
import { Upload, Download, Lock, FileText, History, Trash2, Link2Off } from 'lucide-react';
import { api, errMsg, fileUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel, useRefList } from '../lib/refs';
import { bytes, dateFr, dateTimeFr } from '../lib/format';
import { Card, SectionTitle, Btn, Badge, Modal, Field, Select, Input, Loading, toast, Empty } from './ui';

// Panneau documentaire d'un objet (bien, contrat, contractant) : un même document peut être lié à plusieurs objets sans copie (DOC-001).
export default function DocumentsPanel({ objetType, objetId, title = 'Documents & pièces jointes' }: { objetType: 'bien' | 'contrat' | 'contractant'; objetId: number; title?: string }) {
  const { can } = useAuth(); const label = useLabel(); const types = useRefList('type_document');
  const { data, loading, reload } = useFetch<any>('/documents', { objet_type: objetType, objet_id: objetId, limit: 100 });
  const [up, setUp] = useState(false); const [versions, setVersions] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [typeCode, setTypeCode] = useState(''); const [expir, setExpir] = useState(''); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', f); if (typeCode) fd.append('type_code', typeCode); if (expir) fd.append('date_expiration', expir);
      fd.append('links', JSON.stringify([{ objet_type: objetType, objet_id: objetId }]));
      await api.post('/documents', fd); toast('Document déposé'); setUp(false); setTypeCode(''); setExpir(''); reload();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const newVersion = async (id: number, file: File) => {
    try { const fd = new FormData(); fd.append('file', file); const r = await api.post(`/documents/${id}/version`, fd); toast(r.data.inchange ? 'Fichier identique : aucune nouvelle version' : 'Nouvelle version enregistrée'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const detach = async (id: number) => {
    if (!confirm('Retirer ce document de cette fiche ? (il reste disponible depuis ses autres rattachements)')) return;
    try { await api.delete(`/documents/${id}/liens`, { params: { objet_type: objetType, objet_id: objetId } }); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <Card>
      <SectionTitle icon={<FileText size={20} />} title={title} action={can('documents.write') && <Btn size="sm" icon={<Upload size={14} />} onClick={() => setUp(true)}>Ajouter</Btn>} />
      {loading && !data ? <Loading /> : !data?.rows?.length ? <Empty>Aucun document</Empty> : (
        <ul className="flex flex-col divide-y divide-surface-container-low">
          {data.rows.map((d: any) => (
            <li key={d.id} className="py-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {d.verrouille ? <Lock size={14} className="text-error" /> : <FileText size={14} className="text-primary" />}
                  <span className="font-semibold text-primary truncate max-w-[220px]" title={d.nom}>{d.verrouille ? 'Pièce sensible' : d.nom}</span>
                  {d.sensible && <Badge tone="error">Sensible</Badge>}
                  {d.en_ged && <Badge tone="info">GED</Badge>}
                </div>
                <div className="text-[11px] text-on-surface-variant">{label('type_document', d.type_code)} • v{d.version} • {bytes(d.taille)} • {dateTimeFr(d.updated_at)}{d.date_expiration ? ` • expire le ${dateFr(d.date_expiration)}` : ''}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!d.verrouille && <a href={fileUrl(`/documents/${d.id}/download`)} className="p-1 rounded hover:bg-surface-container-high text-secondary" title="Télécharger"><Download size={16} /></a>}
                {!d.verrouille && <button className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant" title="Versions" onClick={async () => setVersions({ doc: d, rows: (await api.get(`/documents/${d.id}/versions`)).data })}><History size={16} /></button>}
                {can('documents.write') && !d.verrouille && (
                  <>
                    <label className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant cursor-pointer" title="Nouvelle version"><Upload size={16} /><input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && newVersion(d.id, e.target.files[0])} /></label>
                    <button className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant" title="Retirer de cette fiche" onClick={() => detach(d.id)}>{d.liens?.length > 1 ? <Link2Off size={16} /> : <Trash2 size={16} />}</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {up && (
        <Modal title="Ajouter un document" onClose={() => setUp(false)} footer={<><Btn onClick={() => setUp(false)}>Annuler</Btn><Btn variant="primary" disabled={busy} onClick={upload}>Déposer</Btn></>}>
          {err && <div className="text-error text-body-sm">{err}</div>}
          <Field label="Fichier"><input ref={fileRef} type="file" className="text-body-md" /></Field>
          <Field label="Type de document"><Select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}><option value="">— à qualifier —</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}{t.meta?.sensible ? ' (sensible)' : ''}</option>)}</Select></Field>
          <Field label="Date d'expiration / d'échéance" hint="Ex. attestation d'assurance : déclenche une alerte"><Input type="date" value={expir} onChange={(e) => setExpir(e.target.value)} /></Field>
        </Modal>
      )}
      {versions && (
        <Modal title={`Versions — ${versions.doc.nom}`} onClose={() => setVersions(null)}>
          <table className="w-full text-body-md"><thead><tr className="text-label-sm uppercase text-on-surface-variant text-left"><th className="py-1">Version</th><th>Date</th><th>Auteur</th><th>Taille</th></tr></thead>
            <tbody>{versions.rows.map((v: any) => <tr key={v.version} className="border-b border-surface-container-low"><td className="py-1 font-semibold">v{v.version}</td><td>{dateTimeFr(v.created_at)}</td><td>{v.auteur}</td><td>{bytes(v.taille)}</td></tr>)}</tbody></table>
        </Modal>
      )}
    </Card>
  );
}
