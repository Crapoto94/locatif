import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Play, FlaskConical, CheckCircle2, XCircle } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch, useDebounced } from '../lib/hooks';
import { dateTimeFr } from '../lib/format';
import { Card, PageHeader, Tabs, DataTable, Btn, Badge, Input, Select, Field, Modal, Notice, Loading, ErrorBox, SectionTitle, toast } from '../components/ui';

// ========== Comptes & droits ==========
export function AdminDroits() {
  const [tab, setTab] = useState('users');
  return (
    <>
      <PageHeader crumbs={['Configuration', 'Comptes & droits']} title="Administration des comptes & des droits" />
      <Tabs tabs={[{ id: 'users', label: 'Comptes' }, { id: 'matrice', label: 'Matrice des droits' }]} active={tab} onChange={setTab} />
      {tab === 'users' ? <Comptes /> : <Matrice />}
    </>
  );
}

function Comptes() {
  const { data, loading, error, reload } = useFetch<any[]>('/admin/users');
  const { data: profils } = useFetch<any[]>('/admin/users/profils');
  const [edit, setEdit] = useState<any | null>(null); const [add, setAdd] = useState(false);
  const save = async () => { try { await api.put(`/admin/users/${edit.id}`, { profils: edit.profils, actif: edit.actif }); setEdit(null); reload(); toast('Compte mis à jour'); } catch (e) { toast(errMsg(e), 'error'); } };
  const toggle = (p: string) => setEdit((e: any) => ({ ...e, profils: e.profils.includes(p) ? e.profils.filter((x: string) => x !== p) : [...e.profils, p] }));
  return (
    <Card>
      <SectionTitle title="Comptes" sub="Agents authentifiés par l'Active Directory (via l'APM) + compte administrateur local. Un compte n'est jamais supprimé, seulement désactivé."
        action={<Btn size="sm" icon={<Plus size={14} />} onClick={() => setAdd(true)}>Pré-créer un agent</Btn>} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : <DataTable rows={data || []} cols={[
        { key: 'n', label: 'Agent', render: (u: any) => <div><div className="font-semibold text-primary">{u.display_name || u.username}</div><div className="text-[11px] text-on-surface-variant">{u.username}{u.email ? ` • ${u.email}` : ''}</div></div> },
        { key: 's', label: 'Source', render: (u: any) => <Badge tone={u.source === 'local' ? 'warn' : 'info'}>{u.source === 'local' ? 'Local' : 'AD'}</Badge> },
        { key: 'p', label: 'Profils', render: (u: any) => <div className="flex gap-1 flex-wrap">{u.profils.map((p: string) => <Badge key={p}>{p}</Badge>)}</div> },
        { key: 'l', label: 'Dernière connexion', render: (u: any) => dateTimeFr(u.last_login) },
        { key: 'a', label: 'Statut', render: (u: any) => <Badge tone={u.actif ? 'success' : 'muted'}>{u.actif ? 'Actif' : 'Désactivé'}</Badge> },
        { key: 'x', label: '', render: (u: any) => <Btn size="sm" variant="ghost" onClick={() => setEdit({ ...u })}>Modifier</Btn> },
      ]} />}
      {edit && (
        <Modal title={`Compte — ${edit.display_name || edit.username}`} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Annuler</Btn><Btn variant="primary" onClick={save}>Enregistrer</Btn></>}>
          <div className="text-label-sm uppercase text-on-surface-variant tracking-wider">Profils</div>
          {(profils || []).map((p) => <label key={p.code} className="flex items-center gap-2 text-body-md"><input type="checkbox" checked={edit.profils.includes(p.code)} onChange={() => toggle(p.code)} /><strong>{p.code}</strong><span className="text-on-surface-variant">{p.libelle}</span></label>)}
          <label className="flex items-center gap-2 text-body-md mt-space-sm"><input type="checkbox" checked={edit.actif} onChange={(e) => setEdit({ ...edit, actif: e.target.checked })} />Compte actif</label>
        </Modal>
      )}
      {add && <AjoutAgent profils={profils || []} onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload(); }} />}
    </Card>
  );
}

function AjoutAgent({ profils, onClose, onDone }: { profils: any[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const { data } = useFetch<any[]>(dq.length >= 2 ? '/admin/users/ad-search' : null, { q: dq });
  const [f, setF] = useState<any>({ username: '', profil: 'LECTURE' });
  const pick = (a: any) => setF({ ...f, username: String(a.sAMAccountName || a.username || a.login || '').toLowerCase(), display_name: a.displayName || a.cn || a.name, email: a.mail || a.email });
  return (
    <Modal title="Pré-créer un agent" onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" disabled={!f.username} onClick={async () => { try { await api.post('/admin/users', { ...f, profils: [f.profil] }); toast('Agent ajouté'); onDone(); } catch (e) { toast(errMsg(e), 'error'); } }}>Ajouter</Btn></>}>
      <Field label="Rechercher dans l'annuaire"><div className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-outline" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom…" /></div></Field>
      {data && data.length > 0 && <ul className="max-h-40 overflow-y-auto bg-surface-container-low rounded">{data.slice(0, 8).map((a, i) => <li key={i}><button className="w-full text-left px-space-sm py-1.5 hover:bg-surface-container-high" onClick={() => pick(a)}>{a.displayName || a.cn || a.name} <span className="text-on-surface-variant text-body-sm">{a.sAMAccountName || a.username || a.mail}</span></button></li>)}</ul>}
      <Field label="Identifiant (sAMAccountName)"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
      <Field label="Profil initial"><Select value={f.profil} onChange={(e) => setF({ ...f, profil: e.target.value })}>{profils.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.libelle}</option>)}</Select></Field>
    </Modal>
  );
}

function Matrice() {
  const { data: perms } = useFetch<any[]>('/admin/users/permissions'); const { data: profils, reload } = useFetch<any[]>('/admin/users/profils');
  const [draft, setDraft] = useState<Record<string, string[]>>({}); const [busy, setBusy] = useState(false);
  if (!perms || !profils) return <Loading />;
  const cur = (p: any) => draft[p.code] ?? p.permissions;
  const toggle = (p: any, perm: string) => { const c = cur(p); setDraft({ ...draft, [p.code]: c.includes(perm) ? c.filter((x: string) => x !== perm) : [...c, perm] }); };
  const save = async () => { setBusy(true); try { for (const [code, permissions] of Object.entries(draft)) await api.put(`/admin/users/profils/${code}/permissions`, { permissions }); setDraft({}); reload(); toast('Matrice enregistrée'); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };
  return (
    <Card>
      <SectionTitle title="Matrice profils × droits" action={Object.keys(draft).length > 0 && <Btn variant="primary" size="sm" disabled={busy} onClick={save}>Enregistrer les modifications</Btn>} />
      <Notice>Les droits non établis par le cadrage sont <strong>fermés</strong> par défaut, sauf pour l'administrateur : cette matrice est un point de départ à valider avec AFLC, la DSF et la DSI.</Notice>
      <div className="overflow-x-auto mt-space-md">
        <table className="w-full text-body-md border-collapse">
          <thead><tr className="bg-surface-container-high text-label-sm uppercase text-on-surface-variant"><th className="py-2 px-space-md text-left">Droit</th>{profils.map((p) => <th key={p.code} className="px-space-sm">{p.code}</th>)}</tr></thead>
          <tbody>{perms.map((pm) => (
            <tr key={pm.code} className="border-b border-surface-container-low hover:bg-surface-container-low"><td className="py-1.5 px-space-md">{pm.libelle}<div className="text-[10px] text-outline">{pm.code}</div></td>
              {profils.map((p) => <td key={p.code} className="text-center"><input type="checkbox" checked={cur(p).includes(pm.code)} onChange={() => toggle(p, pm.code)} /></td>)}</tr>))}</tbody>
        </table>
      </div>
    </Card>
  );
}

// ========== GED / stockage ==========
export function AdminGed() {
  const { data: c, reload } = useFetch<any>('/admin/ged/config');
  const [f, setF] = useState<any | null>(null); const [res, setRes] = useState<any | null>(null); const [mig, setMig] = useState<any | null>(null); const [busy, setBusy] = useState(false);
  const [path, setPath] = useState(''); const { data: files } = useFetch<any[]>('/admin/ged/browse', { path });
  const v = f || c; if (!v) return <Loading />;
  const set = (k: string, x: any) => setF({ ...v, [k]: x });
  const body = () => ({ mode: v.mode, filerRoot: v.filerRoot, alfrescoUrl: v.alfrescoUrl, alfrescoLogin: v.alfrescoLogin, alfrescoPassword: v.alfrescoPassword, alfrescoRoot: v.alfrescoRoot, archivageActif: v.archivageActif });
  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };

  return (
    <>
      <PageHeader crumbs={['Configuration', 'Stockage / GED']} title="Stockage documentaire & GED" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <Card>
          <SectionTitle title="Paramétrage" sub="Étape 1 : filer (dossier ou partage UNC). Étape 2 : GED Alfresco." />
          <div className="flex flex-col gap-space-md">
            <Field label="Mode de stockage"><Select value={v.mode} onChange={(e) => set('mode', e.target.value)}><option value="filer">Filer (dossier / partage UNC)</option><option value="alfresco">GED Alfresco</option><option value="simulateur">Simulateur (tests)</option></Select></Field>
            {v.mode === 'filer' && <Field label="Racine du filer" hint={`Effective : ${c.filerRootEffectif}`}><Input value={v.filerRoot} onChange={(e) => set('filerRoot', e.target.value)} placeholder="\\serveur\partage\locatif" /></Field>}
            {v.mode === 'alfresco' && <>
              <Field label="URL Alfresco"><Input value={v.alfrescoUrl} onChange={(e) => set('alfrescoUrl', e.target.value)} placeholder="https://ged.ivry.local" /></Field>
              <div className="grid grid-cols-2 gap-space-md"><Field label="Compte technique"><Input value={v.alfrescoLogin} onChange={(e) => set('alfrescoLogin', e.target.value)} /></Field>
                <Field label="Mot de passe" hint={c.alfrescoPasswordDefini ? 'Défini — laisser vide pour le conserver' : undefined}><Input type="password" value={v.alfrescoPassword || ''} onChange={(e) => set('alfrescoPassword', e.target.value)} /></Field></div>
              <Field label="Dossier racine (chemin ou identifiant de nœud)"><Input value={v.alfrescoRoot} onChange={(e) => set('alfrescoRoot', e.target.value)} /></Field>
            </>}
            <div className="flex gap-space-sm flex-wrap">
              <Btn disabled={busy} onClick={() => act(async () => setRes((await api.post('/admin/ged/test', body())).data))}>Tester la connexion</Btn>
              <Btn variant="primary" disabled={busy} onClick={() => act(async () => { await api.put('/admin/ged/config', body()); setF(null); reload(); setRes(null); toast('Paramétrage enregistré'); })}>Enregistrer</Btn>
            </div>
            {res && <Notice tone={res.ok ? 'success' : 'error'}><div className="flex items-center gap-1">{res.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<strong>{res.ok ? 'Connexion réussie' : 'Échec'}</strong> ({res.ms} ms)</div>{res.message}</Notice>}
          </div>
        </Card>
        <div className="flex flex-col gap-space-lg">
          <Card>
            <SectionTitle title="Migration vers le stockage actif" sub="Relit chaque fichier dans son stockage d'origine et le redépose dans le stockage actif. Les clés fs: / alf: coexistent sans rupture." />
            <Btn disabled={busy} onClick={() => act(async () => { if (confirm('Migrer tous les documents vers le stockage actif ?')) setMig((await api.post('/admin/ged/migrate')).data); })}>Lancer la migration</Btn>
            {mig && <Notice tone={mig.erreurs.length ? 'warn' : 'success'}>{mig.migres} / {mig.total} document(s) migré(s). {mig.erreurs.length > 0 && <ul className="mt-1 list-disc ml-4">{mig.erreurs.slice(0, 5).map((e: any) => <li key={e.id}>{e.nom} : {e.message}</li>)}</ul>}</Notice>}
          </Card>
          <Card>
            <SectionTitle title="Explorateur" sub={`/${path}`} />
            {path && <button className="text-secondary text-body-sm mb-1" onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>↑ dossier parent</button>}
            {!files ? <Loading /> : files.length === 0 ? <div className="text-on-surface-variant py-2">Vide.</div> : files.map((x) => (
              <div key={x.nom} className="py-1 border-b border-surface-container-low last:border-0 text-body-md">{x.dossier ? <button className="font-semibold text-primary hover:underline" onClick={() => setPath(`${path}/${x.nom}`.replace(/^\//, ''))}>📁 {x.nom}</button> : <span>📄 {x.nom}</span>}</div>))}
          </Card>
        </div>
      </div>
    </>
  );
}

// ========== Reprise ASTECH ==========
export function AdminReprise() {
  const { data: runs, reload } = useFetch<any[]>('/admin/reprise/runs');
  const { data: ctl, reload: reloadCtl } = useFetch<any>('/admin/reprise/controle');
  const { data: dbl, reload: reloadDbl } = useFetch<any[]>('/admin/reprise/doublons');
  const { data: st, reload: reloadSt } = useFetch<any>('/admin/reprise/statut');
  const [detail, setDetail] = useState<any | null>(null); const [opt, setOpt] = useState({ env: 'prod', documents: false });
  const lancer = async (dryRun: boolean) => {
    try { await api.post('/admin/reprise/lancer', { ...opt, dryRun }); toast(dryRun ? 'Simulation lancée' : 'Reprise lancée'); setTimeout(() => { reloadSt(); reload(); }, 1500); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const trancher = async (id: number, statut: string) => { try { await api.put(`/admin/reprise/doublons/${id}`, { statut }); reloadDbl(); } catch (e) { toast(errMsg(e), 'error'); } };
  const ouvrir = async (id: number) => setDetail((await api.get(`/admin/reprise/runs/${id}`)).data);

  return (
    <>
      <PageHeader crumbs={['Configuration', 'Reprise ASTECH']} title="Contrôle de reprise des données" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
        <Card className="lg:col-span-1">
          <SectionTitle title="Lancer une reprise" sub="Lecture seule sur ASTECH. Idempotent : une relance complète sans écraser les corrections." />
          <div className="flex flex-col gap-space-md">
            <Field label="Base source"><Select value={opt.env} onChange={(e) => setOpt({ ...opt, env: e.target.value })}><option value="prod">Production (PIVRY01)</option><option value="test">Test (TIVRY01)</option></Select></Field>
            <label className="flex items-center gap-2 text-body-md"><input type="checkbox" checked={opt.documents} onChange={(e) => setOpt({ ...opt, documents: e.target.checked })} />Reprendre aussi les documents</label>
            <div className="flex gap-space-sm"><Btn icon={<FlaskConical size={15} />} disabled={st?.en_cours} onClick={() => lancer(true)}>Simuler</Btn><Btn variant="primary" icon={<Play size={15} />} disabled={st?.en_cours} onClick={() => lancer(false)}>Lancer</Btn></div>
            {st?.en_cours && <Notice>Reprise en cours depuis {dateTimeFr(st.depuis)}…</Notice>}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle title="Écarts source ASTECH / application" action={<Btn size="sm" variant="ghost" onClick={reloadCtl}>Actualiser</Btn>} />
          {!ctl ? <Loading /> : <DataTable rows={ctl.lignes.map((l: any, i: number) => ({ ...l, id: i }))} cols={[
            { key: 'o', label: 'Objet', render: (l: any) => <strong>{l.objet}</strong> }, { key: 's', label: 'ASTECH', align: 'right', render: (l: any) => l.source ?? '—' },
            { key: 'a', label: 'Application', align: 'right', render: (l: any) => l.application },
            { key: 'e', label: 'Écart', align: 'right', render: (l: any) => l.ecart === null ? '—' : <Badge tone={l.ecart === 0 ? 'success' : 'warn'}>{l.ecart}</Badge> }, { key: 'n', label: 'Note', render: (l: any) => <span className="text-body-sm text-on-surface-variant">{l.note}</span> },
          ]} />}
        </Card>
        <Card className="lg:col-span-3">
          <SectionTitle title="Historique des reprises" />
          <DataTable rows={runs || []} cols={[
            { key: 'id', label: 'N°', render: (r: any) => `#${r.id}` }, { key: 'd', label: 'Début', render: (r: any) => dateTimeFr(r.debut) },
            { key: 'e', label: 'Base', render: (r: any) => r.environnement }, { key: 'o', label: 'Mode', render: (r: any) => (r.options?.dryRun ? <Badge tone="muted">Simulation</Badge> : <Badge tone="info">Réelle</Badge>) },
            { key: 's', label: 'Statut', render: (r: any) => <Badge tone={r.statut === 'termine' ? 'success' : r.statut === 'erreur' ? 'error' : 'warn'}>{r.statut}</Badge> },
            { key: 'v', label: 'Volumes', render: (r: any) => r.stats?.objets ? Object.entries(r.stats.objets).map(([k, x]: any) => `${k} ${x.crees + x.mis_a_jour}`).join(' • ') : r.erreur || '—' },
            { key: 'x', label: '', render: (r: any) => <Btn size="sm" variant="ghost" onClick={() => ouvrir(r.id)}>Anomalies</Btn> },
          ]} />
        </Card>
        <Card className="lg:col-span-3">
          <SectionTitle title="Doublons probables à examiner" sub="Jamais de fusion automatique : vous tranchez." />
          <DataTable rows={dbl || []} empty="Aucun doublon à examiner." cols={[
            { key: 'en', label: 'Objet', render: (d: any) => <Badge>{d.entite}</Badge> },
            { key: 'a', label: 'Fiche A', render: (d: any) => <Link className="text-secondary hover:underline" to={`/${d.entite === 'bien' ? 'biens' : 'contractants'}/${d.id_a}`}>{d.libelle_a}</Link> },
            { key: 'b', label: 'Fiche B', render: (d: any) => <Link className="text-secondary hover:underline" to={`/${d.entite === 'bien' ? 'biens' : 'contractants'}/${d.id_b}`}>{d.libelle_b}</Link> },
            { key: 'm', label: 'Motif', render: (d: any) => d.motif },
            { key: 'x', label: '', render: (d: any) => <div className="flex gap-1"><Btn size="sm" variant="ghost" onClick={() => trancher(d.id, 'distincts')}>Ce sont deux fiches distinctes</Btn><Btn size="sm" variant="ghost" onClick={() => trancher(d.id, 'a_fusionner_manuellement')}>À fusionner manuellement</Btn></div> },
          ]} />
        </Card>
      </div>
      {detail && (
        <Modal wide title={`Reprise #${detail.id} — ${detail.nb_anomalies} anomalie(s)`} onClose={() => setDetail(null)}>
          {detail.erreur && <ErrorBox message={detail.erreur} />}
          <DataTable rows={detail.anomalies.map((a: any, i: number) => ({ ...a, id: i }))} empty="Aucune anomalie." cols={[
            { key: 'n', label: '', render: (a: any) => <Badge tone={a.niveau === 'info' ? 'info' : 'warn'}>{a.niveau}</Badge> }, { key: 'o', label: 'Objet', render: (a: any) => `${a.objet || ''} ${a.reference || ''}` }, { key: 'm', label: 'Message', render: (a: any) => <span className="text-body-sm">{a.message}</span> },
          ]} />
        </Modal>
      )}
    </>
  );
}
