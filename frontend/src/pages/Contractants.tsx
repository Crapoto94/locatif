import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, Pencil, Users, Trash2, AlertTriangle } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch, useDebounced } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel, useRefList } from '../lib/refs';
import { trackRecent } from '../lib/recents';
import { dateFr, eur } from '../lib/format';
import { Card, PageHeader, DataTable, Pagination, Input, Select, Btn, Badge, Loading, ErrorBox, Modal, Field, Dl, SectionTitle, Notice, toast, statutTone } from '../components/ui';
import DocumentsPanel from '../components/DocumentsPanel';

export function ContractantsListe() {
  const nav = useNavigate(); const { can } = useAuth();
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('nom'); const [dir, setDir] = useState('asc'); const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch<any>('/contractants', { q: dq, type, offset, limit: 25, sort, dir });
  useEffect(() => setOffset(0), [dq, type]);
  const [creer, setCreer] = useState(false);
  const onSort = (k: string) => { if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('asc'); } };
  return (
    <>
      <PageHeader crumbs={['Gestion opérationnelle', 'Contractants']} title="Contractants" actions={can('contractants.write') && <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setCreer(true)}>Nouveau contractant</Btn>} />
      <Card>
        <div className="flex flex-wrap gap-space-sm mb-space-md">
          <div className="relative flex-1 min-w-[240px]"><Search size={16} className="absolute left-2.5 top-2.5 text-outline" /><Input className="pl-8" placeholder="Nom, raison sociale, SIREN, adresse, identifiant tiers…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-48" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous</option><option value="physique">Personnes physiques</option><option value="morale">Personnes morales</option></Select>
        </div>
        {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <DataTable rows={data?.rows || []} sort={sort} dir={dir} onSort={onSort} cols={[
              { key: 'nom', label: 'Contractant', sort: 'nom', render: (c: any) => <div><Link className="font-semibold text-primary hover:underline" to={`/contractants/${c.id}`}>{c.nom}{c.prenom ? ` ${c.prenom}` : ''}</Link>{c.doublon_possible && <span title="Doublon possible à examiner" className="ml-1 inline-block text-[#8a5a00]"><AlertTriangle size={13} className="inline" /></span>}</div> },
              { key: 'type', label: 'Nature', sort: 'type', render: (c: any) => <Badge tone={c.type === 'morale' ? 'info' : 'neutral'}>{c.type === 'morale' ? 'Personne morale' : 'Personne physique'}</Badge> },
              { key: 'adresse', label: 'Adresse', render: (c: any) => [c.adresse, c.code_postal, c.ville].filter(Boolean).join(' ') || '—' },
              { key: 'siren', label: 'SIREN / tiers SEDIT', render: (c: any) => <span className="tabular-nums">{[c.siren, c.tiers_sedit_id].filter(Boolean).join(' • ') || '—'}</span> },
              { key: 'ct', label: 'Contrats', align: 'right', render: (c: any) => `${c.contrats_actifs} actif${c.contrats_actifs > 1 ? 's' : ''} / ${c.contrats_total}` },
              { key: 'a', label: '', render: (c: any) => <Btn size="sm" variant="ghost" onClick={() => nav(`/contractants/${c.id}`)}>Ouvrir</Btn> },
            ]} />
            <Pagination total={data?.total || 0} limit={25} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      {creer && <ContractantForm onClose={() => setCreer(false)} onSaved={(c) => { setCreer(false); nav(`/contractants/${c.id}`); }} />}
    </>
  );
}

export function ContractantForm({ contractant, onClose, onSaved }: { contractant?: any; onClose: () => void; onSaved: (c: any) => void }) {
  const [f, setF] = useState<any>(contractant || { type: 'physique' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = contractant ? await api.put(`/contractants/${contractant.id}`, f) : await api.post('/contractants', f); toast('Contractant enregistré'); onSaved(r.data); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const morale = f.type === 'morale';
  return (
    <Modal title={contractant ? 'Modifier le contractant' : 'Nouveau contractant'} onClose={onClose} wide footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" disabled={busy || !f.nom} onClick={save}>Enregistrer</Btn></>}>
      {err && <ErrorBox message={err} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <Field label="Nature"><Select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="physique">Personne physique</option><option value="morale">Personne morale</option></Select></Field>
        {morale ? <Field label="Forme juridique"><Input value={f.forme_juridique || ''} onChange={(e) => set('forme_juridique', e.target.value)} /></Field> : <Field label="Prénom"><Input value={f.prenom || ''} onChange={(e) => set('prenom', e.target.value)} /></Field>}
        <Field label={morale ? 'Raison sociale *' : 'Nom *'} className="sm:col-span-2"><Input value={f.nom || ''} onChange={(e) => set('nom', e.target.value)} /></Field>
        {morale && <Field label="SIREN"><Input value={f.siren || ''} onChange={(e) => set('siren', e.target.value)} /></Field>}
        <Field label="Identifiant tiers SEDIT" hint="Si le tiers n'existe pas, il doit d'abord être créé dans le système financier"><Input value={f.tiers_sedit_id || ''} onChange={(e) => set('tiers_sedit_id', e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Téléphone"><Input value={f.telephone || ''} onChange={(e) => set('telephone', e.target.value)} /></Field>
        <Field label="Adresse" className="sm:col-span-2"><Input value={f.adresse || ''} onChange={(e) => set('adresse', e.target.value)} /></Field>
        <Field label="Code postal"><Input value={f.code_postal || ''} onChange={(e) => set('code_postal', e.target.value)} /></Field>
        <Field label="Ville"><Input value={f.ville || ''} onChange={(e) => set('ville', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function ContractantFiche() {
  const { id } = useParams(); const { can } = useAuth(); const label = useLabel();
  const { data: c, loading, error, reload } = useFetch<any>(`/contractants/${id}`);
  const [edit, setEdit] = useState(false); const [contact, setContact] = useState(false);
  const [cf, setCf] = useState<any>({});
  useEffect(() => { if (c) trackRecent({ to: `/contractants/${c.id}`, label: c.nom }); }, [c]);
  if (loading && !c) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!c) return null;
  const addContact = async () => { try { await api.post(`/contractants/${c.id}/contacts`, cf); setContact(false); setCf({}); reload(); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <>
      <PageHeader crumbs={['Contractants', c.nom]} title={`${c.nom}${c.prenom ? ` ${c.prenom}` : ''}`} actions={can('contractants.write') && <Btn icon={<Pencil size={16} />} onClick={() => setEdit(true)}>Modifier</Btn>}>
        <div className="flex gap-2 mt-1"><Badge tone={c.type === 'morale' ? 'info' : 'neutral'}>{c.type === 'morale' ? 'Personne morale' : 'Personne physique'}</Badge>{!c.actif && <Badge tone="muted">Inactif</Badge>}{c.tiers_sedit_id && <Badge tone="muted">Tiers SEDIT {c.tiers_sedit_id}</Badge>}</div>
      </PageHeader>
      {c.doublons?.length > 0 && <div className="mb-space-md"><Notice tone="warn">Doublon(s) possible(s) signalé(s) par la reprise (aucune fusion automatique) : {c.doublons.map((d: any, i: number) => <span key={d.id}>{i > 0 && ', '}<Link className="underline font-semibold" to={`/contractants/${d.id}`}>{d.nom}</Link></span>)}.</Notice></div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
        <div className="lg:col-span-2 flex flex-col gap-space-lg">
          <Card>
            <SectionTitle icon={<Users size={20} />} title="Coordonnées" />
            <Dl items={[['Adresse', [c.adresse, c.code_postal, c.ville].filter(Boolean).join(' ')], ['Email', c.email], ['Téléphone', c.telephone], ['SIREN', c.siren], ['Forme juridique', c.forme_juridique], ['Libellé ASTECH', c.astech_nom]]} />
          </Card>
          {c.type === 'morale' && (
            <Card>
              <SectionTitle title="Interlocuteurs, signataires et représentants" action={can('contractants.write') && <Btn size="sm" icon={<Plus size={14} />} onClick={() => setContact(true)}>Ajouter</Btn>} />
              {c.contacts.length === 0 ? <div className="text-on-surface-variant py-2">Aucun interlocuteur renseigné.</div> : (
                <DataTable rows={c.contacts} cols={[
                  { key: 'nom', label: 'Nom', render: (x: any) => <div><div className="font-semibold">{x.nom}</div><div className="text-[11px] text-on-surface-variant">{x.fonction}</div></div> },
                  { key: 'r', label: 'Rôle', render: (x: any) => <div className="flex gap-1 flex-wrap">{x.signataire && <Badge tone="info">Signataire</Badge>}{x.representant_legal && <Badge>Représentant légal{x.type_representation ? ` (${x.type_representation})` : ''}</Badge>}{!x.signataire && !x.representant_legal && <Badge tone="muted">Interlocuteur</Badge>}</div> },
                  { key: 'email', label: 'Contact', render: (x: any) => [x.email, x.telephone].filter(Boolean).join(' • ') || '—' },
                  { key: 'a', label: '', render: (x: any) => can('contractants.write') && <button className="p-1 text-on-surface-variant hover:text-error" onClick={async () => { await api.delete(`/contractants/${c.id}/contacts/${x.id}`); reload(); }}><Trash2 size={15} /></button> },
                ]} />
              )}
            </Card>
          )}
          <Card>
            <SectionTitle title={`Contrats (${c.contrats.length})`} />
            {c.contrats.length === 0 ? <div className="text-on-surface-variant py-2">Aucun contrat.</div> : (
              <DataTable rows={c.contrats} cols={[
                { key: 'numero', label: 'Contrat', render: (k: any) => <Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${k.id}`}>{k.numero}</Link> },
                { key: 'type', label: 'Type', render: (k: any) => label('type_contrat', k.type_code) },
                { key: 'role', label: 'Rôle', render: (k: any) => label('role_contractant', k.role_code) },
                { key: 'periode', label: 'Période', render: (k: any) => `${dateFr(k.date_debut)} → ${dateFr(k.date_fin)}` },
                { key: 'loyer', label: 'Loyer', align: 'right', render: (k: any) => eur(k.loyer) },
                { key: 's', label: 'Statut', render: (k: any) => <Badge tone={statutTone(k.statut_code)}>{label('statut_contrat', k.statut_code)}</Badge> },
              ]} />
            )}
          </Card>
          <Card>
            <SectionTitle title={`Biens concernés (${c.biens.length})`} />
            <div className="flex flex-wrap gap-2">{c.biens.length === 0 ? <span className="text-on-surface-variant">Aucun bien.</span> : c.biens.map((b: any) => <Link key={b.id} to={`/biens/${b.id}`} className="px-2 py-1 rounded bg-surface-container-low hover:bg-surface-container-high text-body-sm">{b.designation}{b.adresse ? ` — ${b.adresse}` : ''}</Link>)}</div>
          </Card>
        </div>
        <div><DocumentsPanel objetType="contractant" objetId={c.id} /></div>
      </div>
      {edit && <ContractantForm contractant={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      {contact && (
        <Modal title="Ajouter un interlocuteur" onClose={() => setContact(false)} footer={<><Btn onClick={() => setContact(false)}>Annuler</Btn><Btn variant="primary" disabled={!cf.nom} onClick={addContact}>Ajouter</Btn></>}>
          <Field label="Nom *"><Input value={cf.nom || ''} onChange={(e) => setCf({ ...cf, nom: e.target.value })} /></Field>
          <Field label="Fonction"><Input value={cf.fonction || ''} onChange={(e) => setCf({ ...cf, fonction: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-space-md"><Field label="Email"><Input value={cf.email || ''} onChange={(e) => setCf({ ...cf, email: e.target.value })} /></Field><Field label="Téléphone"><Input value={cf.telephone || ''} onChange={(e) => setCf({ ...cf, telephone: e.target.value })} /></Field></div>
          <label className="flex items-center gap-2 text-body-md"><input type="checkbox" checked={Boolean(cf.signataire)} onChange={(e) => setCf({ ...cf, signataire: e.target.checked })} />Signataire</label>
          <label className="flex items-center gap-2 text-body-md"><input type="checkbox" checked={Boolean(cf.representant_legal)} onChange={(e) => setCf({ ...cf, representant_legal: e.target.checked })} />Représentant légal</label>
          {cf.representant_legal && <Field label="Type de représentation"><Input value={cf.type_representation || ''} onChange={(e) => setCf({ ...cf, type_representation: e.target.value })} /></Field>}
        </Modal>
      )}
    </>
  );
}
