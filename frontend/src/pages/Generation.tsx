import { useRef, useState } from 'react';
import { FileText, Upload, Download, Eye } from 'lucide-react';
import DocumentViewer from '../components/DocumentViewer';
import { api, errMsg, fileUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Card, PageHeader, SectionTitle, Btn, Badge, Field, Input, Select, Notice, Loading, toast } from '../components/ui';

export default function Generation() {
  const { can } = useAuth();
  const { data: modeles, reload } = useFetch<any[]>('/generation/modeles');
  const { data: vars } = useFetch<any>('/generation/variables');
  const [code, setCode] = useState('revision_loyer'); const [q, setQ] = useState(''); const { data: cs } = useFetch<any>(q.length >= 2 ? '/contrats' : null, { q, limit: 8 });
  const [contrat, setContrat] = useState<any | null>(null); const [annee, setAnnee] = useState(new Date().getFullYear() - 1);
  const [res, setRes] = useState<any | null>(null); const [busy, setBusy] = useState(false); const [vue, setVue] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const generer = async () => {
    setBusy(true); setRes(null);
    try { setRes((await api.post('/generation/generer', { code, contrat_id: contrat.id, params: { annee } })).data); toast('Document généré et enregistré dans le dossier du contrat'); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const depot = async (c: string, f: File) => {
    try { const fd = new FormData(); fd.append('file', f); await api.post(`/generation/modeles/${c}`, fd); toast('Modèle Word enregistré'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'Génération documentaire']} title="Génération documentaire" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <Card>
          <SectionTitle icon={<FileText size={20} />} title="Générer un document" sub="Word + PDF produits à partir du modèle et enregistrés dans le dossier du contrat." />
          <div className="flex flex-col gap-space-md">
            <Field label="Modèle"><Select value={code} onChange={(e) => setCode(e.target.value)}>{(modeles || []).filter((m) => m.actif).map((m) => <option key={m.code} value={m.code}>{m.libelle}</option>)}</Select></Field>
            <Field label="Contrat">
              {contrat ? <div className="flex items-center justify-between bg-surface-container-low rounded px-space-sm py-2"><strong className="text-primary">{contrat.numero}</strong><button className="text-secondary text-body-sm" onClick={() => setContrat(null)}>Changer</button></div> : (
                <div className="relative"><Input placeholder="N° de contrat ou contractant…" value={q} onChange={(e) => setQ(e.target.value)} />
                  {cs?.rows?.length > 0 && <ul className="absolute z-10 mt-1 w-full bg-surface-container-lowest rounded-lg shadow-lg">{cs.rows.map((c: any) => <li key={c.id}><button className="w-full text-left px-space-sm py-2 hover:bg-surface-container-low" onClick={() => { setContrat(c); setQ(''); }}><strong className="text-primary">{c.numero}</strong> <span className="text-body-sm text-on-surface-variant">{(c.contractants || []).map((x: any) => x.nom).join(', ')}</span></button></li>)}</ul>}
                </div>
              )}
            </Field>
            {code === 'regularisation_charges' && <Field label="Exercice"><Input type="number" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} /></Field>}
            {code === 'revision_loyer' && <Notice>Le document reprend la dernière révision appliquée au contrat.</Notice>}
            {code === 'regularisation_charges' && <Notice>La régularisation de l'exercice doit avoir été enregistrée (menu Charges).</Notice>}
            <Btn variant="primary" disabled={!contrat || busy || !can('documents.generer')} onClick={generer}>{busy ? 'Génération…' : 'Générer'}</Btn>
            {res && (
              <Notice tone="success">
                Documents créés :
                <div className="flex flex-wrap gap-2 mt-1">
                  {res.pdf && <button className="inline-flex items-center gap-1 text-secondary font-semibold hover:underline" onClick={() => setVue(res.pdf.id)}><Eye size={14} />Afficher le PDF</button>}
                  <a className="inline-flex items-center gap-1 text-on-surface-variant hover:underline" href={fileUrl(`/documents/${res.docx.id}/download`)}><Download size={14} />Télécharger le Word</a>
                </div>
                {res.avertissement && <div className="mt-1 text-[#6b4300]">{res.avertissement}</div>}
              </Notice>
            )}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Modèles Word" sub="Administration réservée à AFLC / Gestion Locative / Admin." />
          {!modeles ? <Loading /> : modeles.map((m) => (
            <div key={m.code} className="py-space-sm border-b border-surface-container-low last:border-0 flex items-center justify-between gap-2">
              <div><div className="font-semibold text-primary">{m.libelle}</div><div className="text-body-sm text-on-surface-variant">{m.fichier ? <>Modèle personnalisé : {m.fichier} (v{m.version})</> : <Badge tone="muted">Modèle intégré</Badge>}</div></div>
              {can('modeles.admin') && <><input ref={fileRef} type="file" accept=".docx" className="hidden" id={`m-${m.code}`} onChange={(e) => e.target.files?.[0] && depot(m.code, e.target.files[0])} />
                <label htmlFor={`m-${m.code}`} className="h-8 px-space-sm rounded bg-surface-container-high text-label-md inline-flex items-center gap-1 cursor-pointer hover:bg-surface-container-highest"><Upload size={14} />Déposer un .docx</label>
                {m.fichier && <Btn size="sm" variant="ghost" onClick={async () => { await api.delete(`/generation/modeles/${m.code}`); reload(); }}>Revenir au modèle intégré</Btn>}</>}
            </div>
          ))}
          {vars && <div className="mt-space-md text-body-sm"><div className="text-label-sm uppercase text-on-surface-variant tracking-wider mb-1">Balises utilisables dans un modèle Word</div>
            <div className="flex flex-wrap gap-1">{[...vars.communes, ...vars.revision_loyer, ...vars.regularisation_charges].map((v: string) => <code key={v} className="bg-surface-container-low px-1.5 py-0.5 rounded">{`{${v}}`}</code>)}</div>
            <p className="text-on-surface-variant mt-2">Les utilisateurs ne modifient pas le modèle : toute évolution passe par l'administration. Un modèle personnalisé nécessite LibreOffice côté serveur pour produire le PDF.</p></div>}
        </Card>
      </div>
      {vue && <DocumentViewer documentId={vue} onClose={() => setVue(null)} />}
    </>
  );
}
