import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { eur, num } from '../lib/format';
import { Card, PageHeader, Tabs, DataTable, Btn, Badge, Input, Select, Field, Modal, Notice, Loading, toast, SectionTitle } from '../components/ui';
import EntityPicker, { type PickItem } from '../components/EntityPicker';

const CLES: Record<string, string> = { tantiemes: 'Tantièmes', surface: 'Surface', pourcentage: 'Pourcentage', montant_fixe: 'Montant fixe' };

export default function Charges() {
  const { can } = useAuth(); const w = can('charges.write');
  const [tab, setTab] = useState('depenses'); const [annee, setAnnee] = useState(new Date().getFullYear() - 1);
  return (
    <>
      <PageHeader crumbs={['Finances & quittancement', 'Charges']} title="Charges locatives & régularisation"
        actions={<Field label="Exercice"><Input type="number" className="w-28" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} /></Field>} />
      <Tabs tabs={[{ id: 'depenses', label: 'Dépenses réelles' }, { id: 'regul', label: 'Régularisation annuelle' }, { id: 'regs', label: 'Régularisations enregistrées' }]} active={tab} onChange={setTab} />
      {tab === 'depenses' && <Depenses annee={annee} w={w} />}
      {tab === 'regul' && <Regul annee={annee} w={w} />}
      {tab === 'regs' && <Registre />}
    </>
  );
}

function Depenses({ annee, w }: { annee: number; w: boolean }) {
  const { data, loading, reload } = useFetch<any[]>('/charges', { annee });
  const [f, setF] = useState<any | null>(null); const [bien, setBien] = useState<PickItem[]>([]); const [ctr, setCtr] = useState<PickItem[]>([]);
  const save = async () => {
    try { await api.post('/charges', { ...f, annee, bien_id: bien[0]?.id, contrat_id: f.contrat_id || null }); toast('Dépense enregistrée'); setF(null); setBien([]); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <Card>
      <SectionTitle title={`Dépenses réelles ${annee}`} sub="Saisies manuellement. Rattachées à un bâtiment / bien (répartition entre ses contrats) ou directement à un contrat."
        action={w && <Btn size="sm" icon={<Plus size={14} />} onClick={() => setF({ cle_repartition: 'montant_fixe', nature: 'reel' })}>Saisir une dépense</Btn>} />
      {loading && !data ? <Loading /> : <DataTable rows={data || []} empty="Aucune dépense saisie pour cet exercice." cols={[
        { key: 'l', label: 'Libellé', render: (c: any) => <strong>{c.libelle}</strong> },
        { key: 'r', label: 'Rattachement', render: (c: any) => c.contrat_id ? <Link className="text-secondary hover:underline" to={`/contrats/${c.contrat_id}`}>{c.contrat_numero}</Link> : <Link className="text-secondary hover:underline" to={`/biens/${c.bien_id}`}>{c.bien}</Link> },
        { key: 'm', label: 'Montant', align: 'right', render: (c: any) => eur(c.montant) },
        { key: 'k', label: 'Clé de répartition', render: (c: any) => <span>{CLES[c.cle_repartition]}{c.valeur_cle !== null ? ` — ${num(c.valeur_cle, 2)}${c.total_cle ? ` / ${num(c.total_cle, 2)}` : ''}` : ''}</span> },
        { key: 'x', label: '', render: (c: any) => w && <button className="p-1 text-on-surface-variant hover:text-error" onClick={async () => { if (confirm('Supprimer cette dépense ?')) { await api.delete(`/charges/${c.id}`); reload(); } }}><Trash2 size={15} /></button> },
      ]} />}
      {f && (
        <Modal title="Nouvelle dépense réelle" wide onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Annuler</Btn><Btn variant="primary" disabled={!f.libelle || (!bien.length && !f.contrat_id)} onClick={save}>Enregistrer</Btn></>}>
          <Field label="Libellé *"><Input value={f.libelle || ''} onChange={(e) => setF({ ...f, libelle: e.target.value })} /></Field>
          <Field label="Montant total de la dépense (€)"><Input type="number" step="0.01" value={f.montant ?? ''} onChange={(e) => setF({ ...f, montant: e.target.value })} /></Field>
          <Field label="Bâtiment ou bien concerné"><EntityPicker kind="biens" value={bien} onChange={(v) => setBien(v.slice(-1))} /></Field>
          <div className="grid grid-cols-3 gap-space-md">
            <Field label="Clé de répartition"><Select value={f.cle_repartition} onChange={(e) => setF({ ...f, cle_repartition: e.target.value })}>{Object.entries(CLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label={f.cle_repartition === 'pourcentage' ? 'Pourcentage (%)' : f.cle_repartition === 'montant_fixe' ? 'Montant attribué (€)' : 'Part du contrat'}><Input type="number" step="0.0001" value={f.valeur_cle ?? ''} onChange={(e) => setF({ ...f, valeur_cle: e.target.value })} /></Field>
            {['tantiemes', 'surface'].includes(f.cle_repartition) && <Field label="Total de la clé"><Input type="number" step="0.0001" value={f.total_cle ?? ''} onChange={(e) => setF({ ...f, total_cle: e.target.value })} /></Field>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Regul({ annee, w }: { annee: number; w: boolean }) {
  const [ctr, setCtr] = useState<PickItem[]>([]); const [res, setRes] = useState<any | null>(null); const [busy, setBusy] = useState(false);
  const calc = async (id: number) => { setBusy(true); try { setRes((await api.get('/charges/regularisation/calculer', { params: { contrat_id: id, annee } })).data); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };
  const save = async (statut: string) => { try { await api.post('/charges/regularisation', { contrat_id: res.contrat_id, annee, statut }); toast(statut === 'validee' ? 'Régularisation validée' : 'Brouillon enregistré'); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <Card>
      <SectionTitle icon={<Calculator size={20} />} title={`Régularisation ${annee}`} sub="Provisions appelées comparées à la quote-part des dépenses réelles, au prorata de la durée d'occupation." />
      <div className="max-w-xl mb-space-md"><Field label="Contrat">
        <EntityPickerContrat onPick={(id) => calc(id)} /></Field></div>
      {busy && <Loading />}
      {res && !busy && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-md">
            <div className="bg-surface-container-low rounded-lg p-space-md"><div className="text-label-sm text-on-surface-variant uppercase">Provisions appelées</div><div className="text-headline-lg text-primary tabular-nums">{eur(res.provisions_appelees)}</div></div>
            <div className="bg-surface-container-low rounded-lg p-space-md"><div className="text-label-sm text-on-surface-variant uppercase">Charges réelles (quote-part)</div><div className="text-headline-lg text-primary tabular-nums">{eur(res.charges_reelles)}</div></div>
            <div className="bg-surface-container-low rounded-lg p-space-md"><div className="text-label-sm text-on-surface-variant uppercase">Prorata d'occupation</div><div className="text-headline-lg text-primary tabular-nums">{res.prorata_jours}/{res.prorata_base} j</div></div>
            <div className={`rounded-lg p-space-md ${res.solde > 0 ? 'bg-error-container' : 'bg-[#e1f4e7]'}`}><div className="text-label-sm uppercase">Solde</div><div className="text-headline-lg tabular-nums">{eur(res.solde)}</div><div className="text-body-sm">{res.solde > 0 ? 'à régler par le contractant' : 'à restituer au contractant'}</div></div>
          </div>
          <DataTable rows={res.detail.map((d: any) => ({ ...d }))} empty="Aucune dépense réelle rattachée : saisissez-les dans l'onglet « Dépenses réelles »." cols={[
            { key: 'l', label: 'Dépense', render: (d: any) => d.libelle }, { key: 'm', label: 'Montant total', align: 'right', render: (d: any) => eur(d.montant) },
            { key: 'k', label: 'Clé', render: (d: any) => CLES[d.cle] }, { key: 'q', label: 'Quote-part', align: 'right', render: (d: any) => <strong>{eur(d.quote_part)}</strong> },
          ]} />
          {w && <div className="flex gap-space-sm mt-space-md"><Btn onClick={() => save('brouillon')}>Enregistrer en brouillon</Btn><Btn variant="primary" onClick={() => save('validee')}>Valider la régularisation</Btn><Link className="h-9 px-space-md rounded text-label-md font-medium inline-flex items-center bg-surface-container-high hover:bg-surface-container-highest" to="/generation">Générer le courrier</Link></div>}
        </>
      )}
    </Card>
  );
}

function EntityPickerContrat({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState(''); const { data } = useFetch<any>(q.length >= 2 ? '/contrats' : null, { q, limit: 8 });
  return (
    <div className="relative">
      <Input placeholder="N° de contrat ou contractant…" value={q} onChange={(e) => setQ(e.target.value)} />
      {data?.rows?.length > 0 && <ul className="absolute z-10 mt-1 w-full bg-surface-container-lowest rounded-lg shadow-lg max-h-56 overflow-y-auto">{data.rows.map((c: any) => <li key={c.id}><button className="w-full text-left px-space-sm py-2 hover:bg-surface-container-low" onClick={() => { onPick(c.id); setQ(''); }}><strong className="text-primary">{c.numero}</strong> <span className="text-on-surface-variant text-body-sm">{(c.contractants || []).map((x: any) => x.nom).join(', ')}</span></button></li>)}</ul>}
    </div>
  );
}

function Registre() {
  const { data, loading } = useFetch<any[]>('/charges/regularisations');
  if (loading && !data) return <Loading />;
  return <Card><DataTable rows={data || []} empty="Aucune régularisation enregistrée." cols={[
    { key: 'n', label: 'Contrat', render: (r: any) => <Link className="font-bold text-secondary hover:underline" to={`/contrats/${r.contrat_id}`}>{r.numero}</Link> }, { key: 'a', label: 'Exercice', render: (r: any) => r.annee },
    { key: 'p', label: 'Provisions', align: 'right', render: (r: any) => eur(r.provisions_appelees) }, { key: 'c', label: 'Charges réelles', align: 'right', render: (r: any) => eur(r.charges_reelles) },
    { key: 's', label: 'Solde', align: 'right', render: (r: any) => <strong>{eur(r.solde)}</strong> }, { key: 'st', label: 'Statut', render: (r: any) => <Badge tone={r.statut === 'validee' ? 'success' : 'neutral'}>{r.statut === 'validee' ? 'Validée' : 'Brouillon'}</Badge> },
  ]} /></Card>;
}
