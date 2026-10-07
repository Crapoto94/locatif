import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Eye } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch, useDebounced } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel, useRefList } from '../lib/refs';
import { dateFr, eur } from '../lib/format';
import { Card, PageHeader, DataTable, Pagination, Input, Select, Btn, Badge, Loading, ErrorBox, Field, SectionTitle, Textarea, Notice, toast, statutTone } from '../components/ui';
import EntityPicker, { type PickItem } from '../components/EntityPicker';
import StreetViewLink from '../components/StreetViewLink';

export function ContratsListe() {
  const nav = useNavigate(); const { can } = useAuth(); const label = useLabel();
  const [sp, setSp] = useSearchParams();
  const types = useRefList('type_contrat'); const statuts = useRefList('statut_contrat');
  const [q, setQ] = useState(sp.get('q') || ''); const [type, setType] = useState(''); const [statut, setStatut] = useState(sp.get('statut') || ''); const [position, setPosition] = useState('');
  const [finAvant, setFinAvant] = useState(sp.get('fin_avant') || ''); const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('numero'); const [dir, setDir] = useState('asc'); const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch<any>('/contrats', { q: dq, type, statut, position, fin_avant: finAvant, offset, limit: 25, sort, dir });
  useEffect(() => setOffset(0), [dq, type, statut, position, finAvant]);
  const onSort = (k: string) => { if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('asc'); } };
  return (
    <>
      <PageHeader crumbs={['Gestion opérationnelle', 'Contrats & baux']} title="Contrats & baux" actions={can('contrats.write') && <Btn variant="primary" icon={<Plus size={16} />} onClick={() => nav('/contrats/nouveau')}>Nouveau contrat</Btn>} />
      <Card>
        <div className="flex flex-wrap gap-space-sm mb-space-md">
          <div className="relative flex-1 min-w-[240px]"><Search size={16} className="absolute left-2.5 top-2.5 text-outline" /><Input className="pl-8" placeholder="N° de contrat, objet, locataire, bien, adresse…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-52" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous les types</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select>
          <Select className="w-40" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous statuts</option>{statuts.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select>
          <Select className="w-40" value={position} onChange={(e) => setPosition(e.target.value)}><option value="">Bailleur & preneur</option><option value="bailleur">Bailleur</option><option value="preneur">Preneur</option></Select>
        </div>
        {finAvant && <div className="mb-space-sm"><Badge tone="warn">Fin de contrat avant le {dateFr(finAvant)}</Badge> <button className="text-secondary text-body-sm underline ml-2" onClick={() => { setFinAvant(''); setSp({}); }}>retirer le filtre</button></div>}
        {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <DataTable rows={data?.rows || []} sort={sort} dir={dir} onSort={onSort} cols={[
              { key: 'numero', label: 'Réf. contrat', sort: 'numero', render: (c: any) => <Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${c.id}`}>{c.numero}</Link> },
              { key: 'type', label: "Type d'acte", sort: 'type', render: (c: any) => <div>{label('type_contrat', c.type_code)}<div className="text-[11px] text-on-surface-variant">{c.position === 'preneur' ? 'Preneur' : 'Bailleur'}{c.gratuit ? ' • gratuit' : ''}</div></div> },
              { key: 'biens', label: 'Bien(s)', render: (c: any) => (c.biens || []).map((b: any) => <div key={b.id} className="flex items-center gap-1"><StreetViewLink bien={b} /><Link className="font-semibold text-primary hover:underline" to={`/biens/${b.id}`}>{b.designation}</Link></div>) || '—' },
              { key: 'ct', label: 'Contractant(s)', render: (c: any) => (c.contractants || []).map((x: any) => <div key={x.id}><Link className="hover:text-secondary hover:underline" to={`/contractants/${x.id}`}>{x.nom}</Link></div>) },
              { key: 'periode', label: 'Période', sort: 'fin', render: (c: any) => <span className="tabular-nums">{dateFr(c.date_debut)} → {dateFr(c.date_fin)}</span> },
              { key: 'loyer', label: 'Loyer', sort: 'loyer', align: 'right', render: (c: any) => <strong className="text-primary">{eur(c.loyer)}</strong> },
              { key: 's', label: 'Statut', sort: 'statut', render: (c: any) => <Badge tone={statutTone(c.statut_code)}>{label('statut_contrat', c.statut_code)}</Badge> },
              { key: 'a', label: '', render: (c: any) => <Link to={`/contrats/${c.id}`} className="p-1 rounded text-on-surface-variant hover:bg-surface-container-high inline-block"><Eye size={18} /></Link> },
            ]} />
            <Pagination total={data?.total || 0} limit={25} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}

const vide = { position: 'bailleur', periodicite: 'mensuelle', terme: 'a_echoir', gratuit: false, loyer: '', charges: '' } as any;

export function ContratNouveau() {
  const nav = useNavigate();
  const types = useRefList('type_contrat'); const roles = useRefList('role_contractant'); const indices = useRefList('type_indice');
  const [f, setF] = useState<any>(vide);
  const [biens, setBiens] = useState<PickItem[]>([]); const [cts, setCts] = useState<PickItem[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const conditions = [];
      if (!f.gratuit && Number(f.loyer) > 0) conditions.push({ rubrique_code: f.position === 'bailleur' ? 'loyer' : 'loyer', montant: Number(f.loyer), date_effet: f.date_debut_quittancement || f.date_entree || f.date_debut });
      if (!f.gratuit && Number(f.charges) > 0) conditions.push({ rubrique_code: 'provision_charges', montant: Number(f.charges), date_effet: f.date_debut_quittancement || f.date_entree || f.date_debut });
      const { loyer, charges, ...contrat } = f;
      const r = await api.post('/contrats', { ...contrat, biens: biens.map((b) => b.id), contractants: cts.map((c) => ({ id: c.id, role: c.role })), conditions });
      toast(`Contrat ${r.data.numero} créé`);
      nav(`/contrats/${r.data.id}`);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader crumbs={['Contrats & baux', 'Nouveau contrat']} title="Nouveau contrat"
        actions={<><Btn onClick={() => nav(-1)}>Annuler</Btn><Btn variant="primary" disabled={busy || !biens.length || !cts.length} onClick={save}>Créer le contrat</Btn></>} />
      <Notice>Le processus d'attribution est instruit en amont de l'application : joignez ensuite la décision, la délibération ou l'acte administratif dans l'onglet Documents de la fiche.</Notice>
      {err && <div className="mt-space-md"><ErrorBox message={err} /></div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg mt-space-md">
        <Card>
          <SectionTitle title="Identification" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <Field label="N° de contrat" hint="Laissé vide : numérotation automatique"><Input value={f.numero || ''} onChange={(e) => set('numero', e.target.value)} /></Field>
            <Field label="Position de la collectivité"><Select value={f.position} onChange={(e) => set('position', e.target.value)}><option value="bailleur">Bailleur / propriétaire</option><option value="preneur">Locataire / preneur</option></Select></Field>
            <Field label="Type de contrat"><Select value={f.type_code || ''} onChange={(e) => set('type_code', e.target.value)}><option value="">—</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
            <Field label="Nature"><Select value={f.gratuit ? 'gratuit' : 'payant'} onChange={(e) => set('gratuit', e.target.value === 'gratuit')}><option value="payant">Payant</option><option value="gratuit">Gratuit</option></Select></Field>
            <Field label="Objet" className="sm:col-span-2"><Textarea rows={2} value={f.objet || ''} onChange={(e) => set('objet', e.target.value)} /></Field>
            <Field label="Date de signature"><Input type="date" value={f.date_signature || ''} onChange={(e) => set('date_signature', e.target.value)} /></Field>
            <Field label="Début"><Input type="date" value={f.date_debut || ''} onChange={(e) => set('date_debut', e.target.value)} /></Field>
            <Field label="Fin" hint="Ou événement de fin ci-dessous"><Input type="date" value={f.date_fin || ''} onChange={(e) => set('date_fin', e.target.value)} /></Field>
            <Field label="Fin liée à un événement"><Input value={f.fin_evenement || ''} onChange={(e) => set('fin_evenement', e.target.value)} /></Field>
            <Field label="Entrée dans les lieux"><Input type="date" value={f.date_entree || ''} onChange={(e) => set('date_entree', e.target.value)} /></Field>
            <Field label="Début du quittancement"><Input type="date" value={f.date_debut_quittancement || ''} onChange={(e) => set('date_debut_quittancement', e.target.value)} /></Field>
          </div>
        </Card>
        <div className="flex flex-col gap-space-lg">
          <Card>
            <SectionTitle title="Biens concernés *" sub="Un contrat peut porter sur plusieurs biens" />
            <EntityPicker kind="biens" value={biens} onChange={setBiens} />
          </Card>
          <Card>
            <SectionTitle title="Contractants *" sub="Titulaires, cotitulaires, représentants…" />
            <EntityPicker kind="contractants" value={cts} onChange={setCts} roles={roles} />
          </Card>
          {!f.gratuit && (
            <Card>
              <SectionTitle title="Conditions financières" />
              <div className="grid grid-cols-2 gap-space-md">
                <Field label="Loyer / redevance (par échéance)"><Input type="number" step="0.01" value={f.loyer} onChange={(e) => set('loyer', e.target.value)} /></Field>
                <Field label="Provision sur charges"><Input type="number" step="0.01" value={f.charges} onChange={(e) => set('charges', e.target.value)} /></Field>
                <Field label="Périodicité"><Select value={f.periodicite} onChange={(e) => set('periodicite', e.target.value)}><option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option></Select></Field>
                <Field label="Terme"><Select value={f.terme} onChange={(e) => set('terme', e.target.value)}><option value="a_echoir">À échoir</option></Select></Field>
                <Field label="Indice de révision"><Select value={f.indice_type || ''} onChange={(e) => set('indice_type', e.target.value)}><option value="">Aucun</option>{indices.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
                <Field label="Prochaine révision"><Input type="date" value={f.date_revision_prochaine || ''} onChange={(e) => set('date_revision_prochaine', e.target.value)} /></Field>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
