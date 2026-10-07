import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, Building2, Pencil, MapPin } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch, useDebounced } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel, useRefList } from '../lib/refs';
import { trackRecent } from '../lib/recents';
import { dateFr, eur, num } from '../lib/format';
import { Card, PageHeader, DataTable, Pagination, Input, Select, Btn, Badge, Loading, ErrorBox, Modal, Field, Dl, SectionTitle, toast, Tone, statutTone } from '../components/ui';
import DocumentsPanel from '../components/DocumentsPanel';
import StreetViewLink, { streetViewUrl } from '../components/StreetViewLink';

export function BiensListe() {
  const nav = useNavigate();
  const { can } = useAuth();
  const label = useLabel();
  const types = useRefList('type_bien');
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [statut, setStatut] = useState(''); const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('designation'); const [dir, setDir] = useState('asc');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch<any>('/biens', { q: dq, type, statut, offset, limit: 25, sort, dir });
  useEffect(() => setOffset(0), [dq, type, statut]);
  const onSort = (k: string) => { if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('asc'); } };
  const [creer, setCreer] = useState(false);

  return (
    <>
      <PageHeader crumbs={['Gestion opérationnelle', 'Biens & locaux']} title="Biens & locaux"
        actions={can('biens.write') && <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setCreer(true)}>Nouveau bien</Btn>} />
      <Card>
        <div className="flex flex-wrap gap-space-sm mb-space-md">
          <div className="relative flex-1 min-w-[240px]"><Search size={16} className="absolute left-2.5 top-2.5 text-outline" /><Input className="pl-8" placeholder="Désignation, code, adresse, référence cadastrale…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-52" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous les types</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select>
          <Select className="w-44" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Toute occupation</option><option value="occupe">Occupé</option><option value="vacant">Vacant</option></Select>
        </div>
        {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <DataTable rows={data?.rows || []} sort={sort} dir={dir} onSort={onSort} cols={[
              { key: 'designation', label: 'Bien', sort: 'designation', render: (b: any) => <div><div className="flex items-center gap-1"><StreetViewLink bien={b} /><Link className="font-semibold text-primary hover:underline" to={`/biens/${b.id}`}>{b.designation}</Link></div><div className="text-[11px] text-on-surface-variant">{b.code || ''}{b.categorie ? ` • ${b.categorie}` : ''}</div></div> },
              { key: 'type', label: 'Type', sort: 'type', render: (b: any) => label('type_bien', b.type_code) },
              { key: 'adresse', label: 'Adresse', sort: 'adresse', render: (b: any) => [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ') || '—' },
              { key: 'surface', label: 'Surface', sort: 'surface', align: 'right', render: (b: any) => (b.surface ? `${num(b.surface, 1)} m²` : '—') },
              { key: 'occ', label: 'Occupation', render: (b: any) => <div className="flex flex-col gap-0.5"><Badge tone={(b.statut_occupation === 'occupe' ? 'info' : b.statut_occupation === 'vacant' ? 'warn' : 'muted') as Tone}>{label('statut_occupation', b.statut_occupation)}</Badge>{b.disponibilite === 'indisponible' && <Badge tone="error">Indisponible</Badge>}</div> },
              { key: 'occupant', label: 'Occupant / contrat', render: (b: any) => b.contrat_id ? <div><div>{b.occupant || '—'}</div><Link to={`/contrats/${b.contrat_id}`} className="text-secondary text-body-sm hover:underline tabular-nums">{b.contrat_numero}</Link></div> : '—' },
              { key: 'a', label: '', render: (b: any) => <Btn size="sm" variant="ghost" onClick={() => nav(`/biens/${b.id}`)}>Ouvrir</Btn> },
            ]} />
            <Pagination total={data?.total || 0} limit={25} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      {creer && <BienForm onClose={() => setCreer(false)} onSaved={(b) => { setCreer(false); nav(`/biens/${b.id}`); }} />}
    </>
  );
}

function BienForm({ bien, onClose, onSaved }: { bien?: any; onClose: () => void; onSaved: (b: any) => void }) {
  const types = useRefList('type_bien'); const occ = useRefList('statut_occupation'); const motifs = useRefList('motif_indisponibilite');
  const [f, setF] = useState<any>(bien || { niveau: 'unite', disponibilite: 'disponible' });
  const [parents, setParents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get('/biens', { params: { limit: 200, niveau: 'batiment' } }).then((r) => setParents(r.data.rows)).catch(() => {}); }, []);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = bien ? await api.put(`/biens/${bien.id}`, f) : await api.post('/biens', f); toast('Bien enregistré'); onSaved(r.data); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={bien ? 'Modifier le bien' : 'Nouveau bien'} onClose={onClose} wide footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" disabled={busy || !f.designation} onClick={save}>Enregistrer</Btn></>}>
      {err && <ErrorBox message={err} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <Field label="Désignation *" className="sm:col-span-2"><Input value={f.designation || ''} onChange={(e) => set('designation', e.target.value)} /></Field>
        <Field label="Code patrimoine"><Input value={f.code || ''} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Niveau"><Select value={f.niveau} onChange={(e) => set('niveau', e.target.value)}><option value="site">Site / ensemble</option><option value="batiment">Bâtiment / immeuble</option><option value="unite">Unité locative / bien isolé</option></Select></Field>
        <Field label="Type"><Select value={f.type_code || ''} onChange={(e) => set('type_code', e.target.value)}><option value="">—</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
        <Field label="Rattaché à (bâtiment)" hint="Facultatif : un terrain ou un parking peut exister seul"><Select value={f.parent_id || ''} onChange={(e) => set('parent_id', e.target.value ? Number(e.target.value) : null)}><option value="">— aucun —</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.designation}</option>)}</Select></Field>
        <Field label="Adresse" className="sm:col-span-2"><Input value={f.adresse || ''} onChange={(e) => set('adresse', e.target.value)} /></Field>
        <Field label="Code postal"><Input value={f.code_postal || ''} onChange={(e) => set('code_postal', e.target.value)} /></Field>
        <Field label="Ville"><Input value={f.ville || ''} onChange={(e) => set('ville', e.target.value)} /></Field>
        <Field label="Surface (m²)"><Input type="number" step="0.01" value={f.surface ?? ''} onChange={(e) => set('surface', e.target.value)} /></Field>
        <Field label="Référence cadastrale"><Input value={f.reference_cadastrale || ''} onChange={(e) => set('reference_cadastrale', e.target.value)} /></Field>
        <Field label="Occupation"><Select value={f.statut_occupation || ''} onChange={(e) => set('statut_occupation', e.target.value)}><option value="">—</option>{occ.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
        <Field label="Disponibilité"><Select value={f.disponibilite || 'disponible'} onChange={(e) => set('disponibilite', e.target.value)}><option value="disponible">Disponible</option><option value="indisponible">Indisponible</option></Select></Field>
        {f.disponibilite === 'indisponible' && <Field label="Motif d'indisponibilité"><Select value={f.motif_indisponibilite || ''} onChange={(e) => set('motif_indisponibilite', e.target.value)}><option value="">—</option>{motifs.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>}
        <Field label="Direction / service gestionnaire"><Input value={f.direction || ''} onChange={(e) => set('direction', e.target.value)} /></Field>
        <Field label="Gestionnaire"><Input value={f.gestionnaire || ''} onChange={(e) => set('gestionnaire', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function BienFiche() {
  const { id } = useParams();
  const { can } = useAuth(); const label = useLabel();
  const { data: b, loading, error, reload } = useFetch<any>(`/biens/${id}`);
  const [edit, setEdit] = useState(false);
  useEffect(() => { if (b) trackRecent({ to: `/biens/${b.id}`, label: b.designation }); }, [b]);
  if (loading && !b) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!b) return null;

  return (
    <>
      <PageHeader crumbs={['Biens & locaux', b.designation]} title={b.designation}
        actions={<><a href={streetViewUrl(b) || undefined} target="_blank" rel="noopener noreferrer" className={`h-9 px-space-md rounded text-label-md font-medium inline-flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-container-highest ${streetViewUrl(b) ? '' : 'hidden'}`}><MapPin size={16} className="text-error" />Street View</a>{can('biens.write') && <Btn icon={<Pencil size={16} />} onClick={() => setEdit(true)}>Modifier</Btn>}</>}>
        <div className="flex gap-2 flex-wrap mt-1">
          <Badge>{label('type_bien', b.type_code)}</Badge>
          <Badge tone={b.statut_occupation === 'occupe' ? 'info' : 'warn'}>{label('statut_occupation', b.statut_occupation)}</Badge>
          {b.disponibilite === 'indisponible' && <Badge tone="error">Indisponible{b.motif_indisponibilite ? ` — ${label('motif_indisponibilite', b.motif_indisponibilite)}` : ''}</Badge>}
          {b.astech_id && !String(b.astech_id).startsWith('CODE:') && <Badge tone="muted">ASTECH n° {b.astech_id}</Badge>}
        </div>
      </PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
        <div className="lg:col-span-2 flex flex-col gap-space-lg">
          <Card>
            <SectionTitle icon={<Building2 size={20} />} title="Caractéristiques" />
            <Dl items={[['Code patrimoine', b.code], ['Niveau', b.niveau], ['Adresse', [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ')], ['Surface', b.surface ? `${num(b.surface, 2)} m²` : null],
              ['Référence cadastrale', b.reference_cadastrale], ['Catégorie', b.categorie], ['Direction / service', b.direction || b.service_code], ['Gestionnaire', b.gestionnaire],
              ['Rattaché à', b.parent ? <Link className="text-secondary hover:underline" to={`/biens/${b.parent.id}`}>{b.parent.designation}</Link> : null]]} />
            {b.enfants?.length > 0 && <div className="mt-space-md"><div className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Unités rattachées</div>
              <div className="flex flex-wrap gap-2">{b.enfants.map((e: any) => <Link key={e.id} to={`/biens/${e.id}`} className="px-2 py-1 rounded bg-surface-container-low hover:bg-surface-container-high text-body-sm">{e.designation}</Link>)}</div></div>}
          </Card>
          <Card>
            <SectionTitle title={`Contrats liés (${b.contrats.length})`} />
            {b.contrats.length === 0 ? <div className="text-on-surface-variant text-body-md py-2">Aucun contrat — ce bien n'a jamais été loué dans l'application.</div> : (
              <DataTable rows={b.contrats} cols={[
                { key: 'numero', label: 'Contrat', render: (c: any) => <Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${c.id}`}>{c.numero}</Link> },
                { key: 'type', label: 'Type', render: (c: any) => label('type_contrat', c.type_code) },
                { key: 'contractants', label: 'Contractant / occupant' },
                { key: 'periode', label: 'Période', render: (c: any) => `${dateFr(c.date_debut)} → ${dateFr(c.date_fin || c.date_cloture)}` },
                { key: 'loyer', label: 'Loyer', align: 'right', render: (c: any) => eur(c.loyer) },
                { key: 'statut', label: 'Statut', render: (c: any) => <Badge tone={statutTone(c.statut_code)}>{label('statut_contrat', c.statut_code)}</Badge> },
              ]} />
            )}
          </Card>
          <Card>
            <SectionTitle title="Historique d'occupation et de vacance" />
            {b.historique.length === 0 ? <div className="text-on-surface-variant text-body-md py-2">Aucun historique.</div> : (
              <DataTable rows={b.historique} cols={[
                { key: 'type', label: 'Période', render: (h: any) => <Badge tone={h.type === 'occupation' ? 'info' : 'warn'}>{h.type === 'occupation' ? 'Occupation' : 'Vacance'}</Badge> },
                { key: 'dates', label: 'Dates', render: (h: any) => `${dateFr(h.date_debut)} → ${h.date_fin ? dateFr(h.date_fin) : 'en cours'}` },
                { key: 'qui', label: 'Occupant / contrat', render: (h: any) => h.contrat_id ? <Link className="text-secondary hover:underline" to={`/contrats/${h.contrat_id}`}>{h.contrat_numero} — {h.contractants}</Link> : (h.commentaire || '—') },
                { key: 'o', label: 'Origine', render: (h: any) => <span className="text-on-surface-variant text-body-sm">{h.origine === 'contrat' ? 'Déduite du contrat' : h.origine === 'deduite' ? 'Déduite' : 'Saisie'}</span> },
              ]} />
            )}
          </Card>
        </div>
        <div><DocumentsPanel objetType="bien" objetId={b.id} /></div>
      </div>
      {edit && <BienForm bien={b} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
    </>
  );
}
