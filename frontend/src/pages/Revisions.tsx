import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Play, Plus, AlertTriangle, FileDown } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useRefList } from '../lib/refs';
import { dateFr, eur, num } from '../lib/format';
import { Card, PageHeader, Tabs, DataTable, Badge, Btn, Input, Select, Field, Modal, Notice, Loading, toast, SectionTitle } from '../components/ui';

export default function Revisions() {
  const { can } = useAuth(); const [tab, setTab] = useState('masse');
  return (
    <>
      <PageHeader crumbs={['Finances & quittancement', 'Indices & révisions']} title="Indices & révisions des loyers" />
      <Tabs tabs={[{ id: 'masse', label: 'Préparation & révisions en masse' }, { id: 'indices', label: "Référentiel d'indices" }, { id: 'hist', label: 'Historique des révisions' }]} active={tab} onChange={setTab} />
      {tab === 'masse' && <Masse canWrite={can('revisions.write')} />}
      {tab === 'indices' && <Indices canWrite={can('revisions.write')} />}
      {tab === 'hist' && <Historique />}
    </>
  );
}

function Masse({ canWrite }: { canWrite: boolean }) {
  const [jusqu, setJusqu] = useState(new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [sim, setSim] = useState<any | null>(null); const [sel, setSel] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false);
  const simuler = async () => {
    setBusy(true);
    try { const r = await api.post('/revisions/simuler', { jusqu_a: jusqu }); setSim(r.data); setSel(new Set(r.data.lignes.filter((l: any) => l.statut === 'ok').map((l: any) => l.contrat_id))); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const appliquer = async () => {
    if (!confirm(`Appliquer la révision à ${sel.size} contrat(s) ? Les loyers et les échéances planifiées seront mis à jour.`)) return;
    setBusy(true);
    try { const r = await api.post('/revisions/appliquer', { items: [...sel].map((id) => ({ contrat_id: id })) }); toast(`${r.data.appliquees.length} révision(s) appliquée(s), ${r.data.ignorees.length} ignorée(s)`); simuler(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Card>
      <SectionTitle icon={<Calculator size={20} />} title="Simulation avant validation" sub="Contrats dont la date anniversaire de révision est atteinte avant la date choisie. Aucune écriture tant que vous n'appliquez pas." />
      <div className="flex flex-wrap items-end gap-space-md mb-space-md">
        <Field label="Réviser jusqu'au"><Input type="date" value={jusqu} onChange={(e) => setJusqu(e.target.value)} /></Field>
        <Btn variant="primary" icon={<Play size={16} />} disabled={busy} onClick={simuler}>Simuler</Btn>
        {sim && canWrite && <Btn icon={<Calculator size={16} />} disabled={busy || sel.size === 0} onClick={appliquer}>Appliquer à la sélection ({sel.size})</Btn>}
      </div>
      <Notice>Nouveau loyer = ancien loyer × (indice nouveau ÷ indice de référence), l'indice nouveau étant celui du même trimestre de l'année suivante. Si l'indice requis n'est pas publié, <strong>le calcul est bloqué</strong> et signalé : aucune valeur n'est inventée.</Notice>
      {busy && !sim ? <Loading /> : sim && (
        <div className="mt-space-md">
          <div className="text-body-md mb-space-sm"><strong>{sim.total}</strong> contrat(s) à réviser{sim.bloquees > 0 && <> dont <Badge tone="error">{sim.bloquees} bloqué(s)</Badge></>}</div>
          <DataTable rows={sim.lignes.map((l: any) => ({ ...l, id: l.contrat_id }))} empty="Aucune révision à préparer sur cette période." cols={[
            { key: 's', label: '', render: (l: any) => <input type="checkbox" disabled={l.statut !== 'ok'} checked={sel.has(l.contrat_id)} onChange={() => toggle(l.contrat_id)} /> },
            { key: 'n', label: 'Contrat', render: (l: any) => <Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${l.contrat_id}`}>{l.numero}</Link> },
            { key: 'c', label: 'Contractant', render: (l: any) => l.contractants || '—' },
            { key: 'd', label: 'Date de révision', render: (l: any) => dateFr(l.date_revision) },
            { key: 'i', label: 'Indices', render: (l: any) => l.statut === 'ok' ? <span>{l.indice_prec} ({l.valeur_prec}) → <strong>{l.indice_nouv} ({l.valeur_nouv})</strong></span> : <span className="text-error flex items-start gap-1"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />{l.motif_blocage}</span> },
            { key: 'p', label: 'Variation', align: 'right', render: (l: any) => (l.pourcentage !== undefined ? `${num(l.pourcentage, 2)} %` : '—') },
            { key: 'a', label: 'Loyer actuel', align: 'right', render: (l: any) => eur(l.loyer_avant) },
            { key: 'n2', label: 'Nouveau loyer', align: 'right', render: (l: any) => (l.loyer_apres !== undefined ? <strong className="text-primary">{eur(l.loyer_apres)}</strong> : '—') },
          ]} />
        </div>
      )}
    </Card>
  );
}

function Indices({ canWrite }: { canWrite: boolean }) {
  const types = useRefList('type_indice'); const [type, setType] = useState('');
  const { data, loading, reload } = useFetch<any[]>('/revisions/indices', { type });
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <Card>
      <SectionTitle title="Valeurs d'indices" sub="Saisie manuelle aujourd'hui ; récupération automatique souhaitée ultérieurement (mécanisme à définir)."
        action={canWrite && <Btn size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ type_code: types[0]?.code || 'IRL', annee: new Date().getFullYear(), trimestre: 1 })}>Saisir une valeur</Btn>} />
      <div className="mb-space-md"><Select className="w-48" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous les indices</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></div>
      {loading && !data ? <Loading /> : <DataTable rows={data || []} cols={[
        { key: 't', label: 'Indice', render: (i: any) => <Badge>{i.type_code}</Badge> }, { key: 'l', label: 'Libellé', render: (i: any) => i.libelle },
        { key: 'a', label: 'Année', render: (i: any) => i.annee }, { key: 'tr', label: 'Trimestre', render: (i: any) => `T${i.trimestre}` },
        { key: 'v', label: 'Valeur', align: 'right', render: (i: any) => <strong>{i.valeur === null ? <span className="text-error">non publié</span> : num(i.valeur, 2)}</strong> },
        { key: 'p', label: 'Publication', render: (i: any) => dateFr(i.date_publication) },
        { key: 'x', label: '', render: (i: any) => canWrite && <Btn size="sm" variant="ghost" onClick={() => setEdit({ ...i })}>Modifier</Btn> },
      ]} />}
      {edit && (
        <Modal title="Valeur d'indice" onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Annuler</Btn><Btn variant="primary" onClick={async () => { try { await api.post('/revisions/indices', edit); setEdit(null); reload(); toast('Valeur enregistrée'); } catch (e) { toast(errMsg(e), 'error'); } }}>Enregistrer</Btn></>}>
          <div className="grid grid-cols-3 gap-space-md">
            <Field label="Indice"><Select value={edit.type_code} onChange={(e) => setEdit({ ...edit, type_code: e.target.value })}>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
            <Field label="Année"><Input type="number" value={edit.annee} onChange={(e) => setEdit({ ...edit, annee: Number(e.target.value) })} /></Field>
            <Field label="Trimestre"><Select value={edit.trimestre} onChange={(e) => setEdit({ ...edit, trimestre: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>T{n}</option>)}</Select></Field>
            <Field label="Valeur" className="col-span-2"><Input type="number" step="0.01" value={edit.valeur ?? ''} onChange={(e) => setEdit({ ...edit, valeur: e.target.value })} /></Field>
            <Field label="Publiée le"><Input type="date" value={edit.date_publication?.slice(0, 10) || ''} onChange={(e) => setEdit({ ...edit, date_publication: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Historique() {
  const { data, loading } = useFetch<any[]>('/revisions');
  if (loading && !data) return <Loading />;
  return (
    <Card>
      <DataTable rows={data || []} empty="Aucune révision enregistrée." cols={[
        { key: 'n', label: 'Contrat', render: (r: any) => <Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${r.contrat_id}`}>{r.numero}</Link> },
        { key: 'd', label: "Date d'application", render: (r: any) => dateFr(r.date_application || r.date_revision) },
        { key: 'i', label: 'Indices', render: (r: any) => `${r.indice_prec || '—'} → ${r.indice_nouv || '—'}` },
        { key: 'p', label: 'Variation', align: 'right', render: (r: any) => (r.pourcentage !== null ? `${num(r.pourcentage, 2)} %` : '—') },
        { key: 'a', label: 'Avant', align: 'right', render: (r: any) => eur(r.montant_avant) }, { key: 'b', label: 'Après', align: 'right', render: (r: any) => <strong>{eur(r.montant_apres)}</strong> },
        { key: 'r', label: '', render: (r: any) => (r.rattrapage ? <Badge tone="warn">Rattrapage</Badge> : null) },
      ]} />
    </Card>
  );
}
