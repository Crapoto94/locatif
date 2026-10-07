import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, FilePlus2, Plus, Trash2, Lock, Users, Building2, Banknote, ShieldCheck, FileDown, CalendarPlus } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel, useRefList } from '../lib/refs';
import { trackRecent } from '../lib/recents';
import { dateFr, dateTimeFr, eur, moisLabel, num } from '../lib/format';
import { Card, PageHeader, Tabs, DataTable, Badge, Btn, Loading, ErrorBox, Modal, MotifModal, Field, Input, Select, Textarea, Dl, SectionTitle, Notice, toast, statutTone } from '../components/ui';
import EntityPicker, { type PickItem } from '../components/EntityPicker';
import DocumentsPanel from '../components/DocumentsPanel';
import StreetViewLink from '../components/StreetViewLink';
import SeditLink from '../components/SeditLink';
import TitreLink from '../components/TitreLink';

const ECH_STATUT: Record<string, [string, any]> = { planifiee: ['Planifiée', 'neutral'], emise: ['Émise', 'info'], titree: ['Titrée', 'success'], echue_non_emise: ['Échue (non émise)', 'warn'], annulee: ['Annulée', 'muted'] };

export default function ContratFiche() {
  const { id } = useParams();
  const { can } = useAuth(); const label = useLabel();
  const { data: c, loading, error, reload } = useFetch<any>(`/contrats/${id}`);
  const [tab, setTab] = useState('apercu');
  const [modal, setModal] = useState<string | null>(null);
  useEffect(() => { if (c) trackRecent({ to: `/contrats/${c.id}`, label: c.numero }); }, [c]);
  if (loading && !c) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!c) return null;
  const w = can('contrats.write'); const clos = c.statut_code !== 'en_cours';
  const done = () => { setModal(null); reload(); };

  const tabs = [
    { id: 'apercu', label: "Vue d'ensemble" }, { id: 'contractants', label: 'Contractants', badge: c.contractants.length }, { id: 'biens', label: 'Biens', badge: c.biens.length },
    { id: 'finances', label: 'Conditions financières' }, { id: 'revisions', label: 'Indices & révisions', badge: c.revisions.length }, { id: 'echeancier', label: 'Échéancier', badge: c.echeances.length },
    { id: 'documents', label: 'Documents', badge: c.nb_documents }, { id: 'vie', label: 'Vie du contrat' }, { id: 'historique', label: 'Historique' },
  ];

  return (
    <>
      <div className="text-body-sm text-on-surface-variant mb-space-xs"><Link className="hover:underline" to="/contrats">Contrats & baux</Link> / <span className="text-primary font-semibold">{c.numero}</span></div>
      <Card className="mb-space-md">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-space-md">
          <div className="min-w-0">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h1 className="text-headline-lg text-primary font-bold tracking-tight">{c.numero}</h1>
              <Badge tone="info">{c.position === 'preneur' ? 'LOCATAIRE / PRENEUR' : 'BAILLEUR / PROPRIÉTAIRE'}</Badge>
              <Badge tone={statutTone(c.statut_code)}>{label('statut_contrat', c.statut_code)}</Badge>
              <Badge tone="muted">{c.gratuit ? 'Nature : gratuit' : 'Nature : payant'}</Badge>
              {c.astech_id && <Badge tone="muted">ASTECH n° {c.astech_id}</Badge>}
            </div>
            <div className="text-headline-sm text-on-surface mt-1">{label('type_contrat', c.type_code)}</div>
            {c.objet && <p className="text-body-md text-on-surface-variant mt-1">{c.objet}</p>}
            <div className="text-body-md mt-space-sm flex flex-wrap gap-x-space-lg gap-y-1">
              <span><span className="text-on-surface-variant">Période : </span><strong>{dateFr(c.date_debut)} au {c.date_fin ? dateFr(c.date_fin) : (c.fin_evenement || 'sans date de fin')}</strong></span>
              <span><span className="text-on-surface-variant">Prochaine révision : </span><strong>{c.date_revision_prochaine ? `${dateFr(c.date_revision_prochaine)} (${c.indice_type || '—'})` : '—'}</strong></span>
              <span><span className="text-on-surface-variant">Quittancement : </span><strong>{c.periodicite === 'trimestrielle' ? 'Trimestriel' : 'Mensuel'} à échoir</strong></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-space-sm lg:justify-end">
            {w && !clos && <Btn variant="primary" icon={<FilePlus2 size={16} />} onClick={() => setModal('avenant')}>Créer un avenant</Btn>}
            {w && <Btn icon={<Pencil size={16} />} onClick={() => setModal('edit')}>Modifier</Btn>}
            {can('contrats.cloturer') && !clos && <Btn variant="danger" onClick={() => setModal('cloture')}>Clôturer</Btn>}
          </div>
        </div>
        {c.alertes.length > 0 && <div className="mt-space-md"><Notice tone="warn"><strong>{c.alertes.length} alerte(s) active(s) :</strong> {c.alertes.map((a: any) => a.titre).join(' • ')}</Notice></div>}
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'apercu' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
          <Card>
            <SectionTitle icon={<Users size={20} />} title="Contractants rattachés" action={<button className="text-secondary text-body-sm font-semibold hover:underline" onClick={() => setTab('contractants')}>Voir l'onglet</button>} />
            {c.contractants.map((x: any) => <div key={`${x.id}${x.role_code}`} className="py-2 flex items-center justify-between border-b border-surface-container-low last:border-0"><div><Link className="font-semibold text-primary hover:underline" to={`/contractants/${x.id}`}>{x.nom}{x.prenom ? ` ${x.prenom}` : ''}</Link><div className="text-body-sm text-on-surface-variant">{label('role_contractant', x.role_code)}</div></div>{x.tiers_sedit_id && <Badge tone="muted">Tiers {x.tiers_sedit_id}</Badge>}</div>)}
          </Card>
          <Card>
            <SectionTitle icon={<Banknote size={20} />} title="Synthèse financière" sub="Montants attendus (hors TVA)" />
            <div className="bg-surface-container-low rounded-lg p-space-md mb-space-sm"><div className="text-label-sm text-on-surface-variant uppercase">Total par échéance</div><div className="text-display text-primary tabular-nums">{eur(c.conditions.filter((x: any) => !x.date_fin).reduce((s: number, x: any) => s + Number(x.montant), 0))}</div></div>
            {c.conditions.filter((x: any) => !x.date_fin).map((x: any) => <div key={x.id} className="flex justify-between py-1 border-b border-surface-container-low"><span>{label('rubrique', x.rubrique_code)}</span><strong className="tabular-nums">{eur(x.montant)}</strong></div>)}
            <div className="mt-space-sm text-body-md">Dépôt de garantie : <strong>{c.depot ? `${eur(c.depot.montant)}${c.depot.date_versement ? ` (versé le ${dateFr(c.depot.date_versement)})` : ''}` : 'aucun'}</strong></div>
            <div className="text-body-sm text-on-surface-variant mt-1">Restitution financière : relève de la Gestion Financière — à spécifier avec la DSF / FILIEN-SEDIT.</div>
          </Card>
          <Card className="lg:col-span-2">
            <SectionTitle icon={<Building2 size={20} />} title={`Périmètre locatif (${c.biens.length} bien${c.biens.length > 1 ? 's' : ''})`} sub={`Surface cumulée : ${num(c.biens.reduce((s: number, b: any) => s + Number(b.surface || 0), 0), 2)} m²`} />
            {c.biens.map((b: any) => <div key={b.id} className="py-2 flex justify-between border-b border-surface-container-low last:border-0"><div><Link className="font-semibold text-primary hover:underline" to={`/biens/${b.id}`}>{b.designation}</Link><div className="text-body-sm text-on-surface-variant">{[b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ')}</div></div><span className="tabular-nums">{b.surface ? `${num(b.surface, 2)} m²` : ''}</span></div>)}
          </Card>
        </div>
      )}

      {tab === 'contractants' && (
        <Card>
          <SectionTitle title="Contractants du contrat" action={w && <Btn size="sm" icon={<Pencil size={14} />} onClick={() => setModal('contractants')}>Modifier la liste</Btn>} />
          <DataTable rows={c.contractants} cols={[
            { key: 'nom', label: 'Contractant', render: (x: any) => <Link className="font-semibold text-primary hover:underline" to={`/contractants/${x.id}`}>{x.nom}{x.prenom ? ` ${x.prenom}` : ''}</Link> },
            { key: 'role', label: 'Rôle', render: (x: any) => <Badge>{label('role_contractant', x.role_code)}</Badge> },
            { key: 'type', label: 'Nature', render: (x: any) => (x.type === 'morale' ? 'Personne morale' : 'Personne physique') },
            { key: 'adresse', label: 'Adresse', render: (x: any) => [x.adresse, x.code_postal, x.ville].filter(Boolean).join(' ') || '—' },
            { key: 'contact', label: 'Contact', render: (x: any) => [x.email, x.telephone].filter(Boolean).join(' • ') || '—' },
            { key: 'tiers', label: 'Tiers SEDIT', render: (x: any) => <SeditLink code={x.tiers_sedit_id} url={x.sedit_url} /> },
          ]} />
        </Card>
      )}

      {tab === 'biens' && (
        <Card>
          <SectionTitle title="Biens du contrat" action={w && <Btn size="sm" icon={<Pencil size={14} />} onClick={() => setModal('biens')}>Modifier la liste</Btn>} />
          <DataTable rows={c.biens} cols={[
            { key: 'designation', label: 'Bien', render: (b: any) => <span className="inline-flex items-center gap-1"><StreetViewLink bien={b} /><Link className="font-semibold text-primary hover:underline" to={`/biens/${b.id}`}>{b.designation}</Link></span> },
            { key: 'type', label: 'Type', render: (b: any) => label('type_bien', b.type_code) },
            { key: 'adresse', label: 'Adresse', render: (b: any) => [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ') || '—' },
            { key: 'surface', label: 'Surface', align: 'right', render: (b: any) => (b.surface ? `${num(b.surface, 2)} m²` : '—') },
          ]} />
        </Card>
      )}

      {tab === 'finances' && <FinancesTab c={c} w={w && !clos} reload={reload} />}

      {tab === 'revisions' && (
        <Card>
          <SectionTitle icon={<ShieldCheck size={20} />} title="Historique des révisions" action={<Link className="text-secondary text-body-sm font-semibold hover:underline" to="/revisions">Préparer des révisions</Link>} />
          <div className="text-body-sm text-on-surface-variant mb-space-sm">Indice : <strong>{c.indice_type || '—'}</strong> • Dernière révision : <strong>{dateFr(c.date_revision_derniere)}</strong> • Prochaine : <strong>{dateFr(c.date_revision_prochaine)}</strong></div>
          <DataTable rows={c.revisions} empty="Aucune révision enregistrée." cols={[
            { key: 'date', label: "Date d'application", render: (r: any) => dateFr(r.date_application || r.date_revision) },
            { key: 'indices', label: 'Indices', render: (r: any) => <div>{r.indice_prec || '—'} ({r.valeur_prec ?? '—'}) → <strong>{r.indice_nouv || '—'} ({r.valeur_nouv ?? '—'})</strong></div> },
            { key: 'pct', label: 'Variation', align: 'right', render: (r: any) => (r.pourcentage !== null ? `${num(r.pourcentage, 2)} %` : '—') },
            { key: 'avant', label: 'Loyer avant', align: 'right', render: (r: any) => eur(r.montant_avant) },
            { key: 'apres', label: 'Loyer après', align: 'right', render: (r: any) => <strong>{eur(r.montant_apres)}</strong> },
            { key: 'r', label: '', render: (r: any) => (r.rattrapage ? <Badge tone="warn">Rattrapage</Badge> : null) },
          ]} />
        </Card>
      )}

      {tab === 'echeancier' && (
        <Card>
          <SectionTitle title="Échéancier du contrat" sub="Notion locative : distincte de la comptabilité, de l'avis d'échéance et du titre financier"
            action={can('echeancier.write') && !clos && !c.gratuit && <Btn size="sm" icon={<CalendarPlus size={14} />} onClick={() => setModal('gen-ech')}>Générer les échéances</Btn>} />
          <DataTable rows={c.echeances} empty={c.gratuit ? 'Contrat gratuit : pas d\'échéancier.' : 'Aucune échéance générée.'} cols={[
            { key: 'p', label: 'Période', render: (e: any) => <div><div className="font-semibold">{e.libelle || moisLabel(e.periode_debut?.slice(0, 7))}</div><div className="text-[11px] text-on-surface-variant">{dateFr(e.periode_debut)} → {dateFr(e.periode_fin)}</div></div> },
            { key: 'ex', label: 'Exigibilité', render: (e: any) => dateFr(e.date_exigibilite) },
            { key: 'l', label: 'Loyer', align: 'right', render: (e: any) => eur(e.montant_loyer) },
            { key: 'ch', label: 'Charges', align: 'right', render: (e: any) => eur(e.montant_charges) },
            { key: 'pr', label: 'Prorata', align: 'right', render: (e: any) => (e.prorata ? <Badge tone="warn">{e.prorata_jours}/{e.prorata_base} j</Badge> : '—') },
            { key: 't', label: 'Total', align: 'right', render: (e: any) => <strong>{eur(e.montant_total)}</strong> },
            { key: 'titre', label: 'Titre SEDIT / paiement', render: (e: any) => <TitreLink e={e} /> },
            { key: 's', label: 'Statut', render: (e: any) => { const [l, t] = ECH_STATUT[e.statut] || [e.statut, 'neutral']; return <div className="flex flex-col gap-0.5"><Badge tone={t}>{l}</Badge>{e.campagne_retiree && <Badge tone="muted">Retirée de la campagne</Badge>}{e.anomalie && <span className="text-[11px] text-error">{e.anomalie}</span>}</div>; } },
          ]} />
        </Card>
      )}

      {tab === 'documents' && <div className="max-w-2xl"><DocumentsPanel objetType="contrat" objetId={c.id} /></div>}
      {tab === 'vie' && <VieTab c={c} w={w} reload={reload} openModal={setModal} />}
      {tab === 'historique' && (
        <Card>
          <SectionTitle title="Historique et audit du contrat" sub="Toute correction conserve l'ancienne valeur, l'auteur, la date et le motif" />
          <DataTable rows={c.historique} empty="Aucun événement." cols={[
            { key: 'ts', label: 'Date', render: (h: any) => <span className="tabular-nums">{dateTimeFr(h.ts)}</span> },
            { key: 'u', label: 'Utilisateur', render: (h: any) => h.utilisateur || '—' },
            { key: 'e', label: 'Événement', render: (h: any) => <Badge tone="muted">{h.evenement}</Badge> },
            { key: 'c', label: 'Champ', render: (h: any) => h.champ || '—' },
            { key: 'a', label: 'Ancienne valeur', render: (h: any) => h.ancienne_valeur ?? '—' },
            { key: 'n', label: 'Nouvelle valeur', render: (h: any) => <strong>{h.nouvelle_valeur ?? '—'}</strong> },
            { key: 'm', label: 'Motif', render: (h: any) => h.motif || '—' },
          ]} />
        </Card>
      )}

      {modal === 'edit' && <EditModal c={c} onClose={() => setModal(null)} onSaved={(r) => { done(); if (r.certificat_administratif_requis) toast('Période déjà traitée financièrement : un certificat administratif doit être transmis à la DSF.', 'error'); }} />}
      {modal === 'biens' && <ListModal kind="biens" c={c} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'contractants' && <ListModal kind="contractants" c={c} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'avenant' && <SimpleModal title="Nouvel avenant" fields={[['numero', 'N° d\'avenant'], ['date_effet', "Date d'effet", 'date'], ['objet', 'Objet', 'textarea']]} url={`/contrats/${c.id}/avenants`} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'acte' && <SimpleModal title="Acte administratif" fields={[['type', 'Type (décision, délibération, arrêté, email…)'], ['reference', 'Référence'], ['date_acte', "Date de l'acte", 'date'], ['objet', 'Objet', 'textarea']]} url={`/contrats/${c.id}/actes`} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'depot' && <DepotModal c={c} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'gen-ech' && <GenEchModal c={c} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'cloture' && <ClotureModal c={c} onClose={() => setModal(null)} onSaved={done} />}
    </>
  );
}

function FinancesTab({ c, w, reload }: { c: any; w: boolean; reload: () => void }) {
  const label = useLabel(); const rubriques = useRefList('rubrique');
  const [edit, setEdit] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);
  return (
    <Card>
      <SectionTitle icon={<Banknote size={20} />} title="Conditions financières locatives" sub="Loyer, redevance, charges, provisions, taxe foncière… Les montants peuvent évoluer indépendamment du loyer principal."
        action={w && <Btn size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ rubrique_code: 'loyer' })}>Ajouter une ligne</Btn>} />
      <DataTable rows={c.conditions} empty="Aucune condition financière." cols={[
        { key: 'r', label: 'Rubrique', render: (x: any) => <div><div className="font-semibold">{label('rubrique', x.rubrique_code)}</div>{x.libelle && <div className="text-[11px] text-on-surface-variant">{x.libelle}</div>}</div> },
        { key: 'm', label: 'Montant', align: 'right', render: (x: any) => <strong>{eur(x.montant)}</strong> },
        { key: 'q', label: 'Quantité × tarif', render: (x: any) => (x.quantite && x.tarif_unitaire ? `${x.quantite} × ${x.tarif_unitaire}` : '—') },
        { key: 'e', label: 'Effet', render: (x: any) => `${dateFr(x.date_effet)} → ${x.date_fin ? dateFr(x.date_fin) : 'en cours'}` },
        { key: 'i', label: 'Imputation', render: (x: any) => x.imputation || '—' },
        { key: 'a', label: '', render: (x: any) => w && <div className="flex gap-1"><button className="p-1 hover:bg-surface-container-high rounded" onClick={() => setEdit(x)}><Pencil size={14} /></button><button className="p-1 hover:bg-surface-container-high rounded text-error" onClick={() => setDel(x)}><Trash2 size={14} /></button></div> },
      ]} />
      {edit && (
        <MotifModal title={edit.id ? 'Modifier la condition financière' : 'Nouvelle condition financière'} required={Boolean(edit.id)} label="Motif de la modification" confirm="Enregistrer" onCancel={() => setEdit(null)}
          onConfirm={async (motif) => { try { const body = { ...edit, motif }; if (edit.id) await api.put(`/contrats/${c.id}/conditions/${edit.id}`, body); else await api.post(`/contrats/${c.id}/conditions`, body); setEdit(null); reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>
          <div className="grid grid-cols-2 gap-space-md">
            <Field label="Rubrique"><Select value={edit.rubrique_code} onChange={(e) => setEdit({ ...edit, rubrique_code: e.target.value })}>{rubriques.map((r) => <option key={r.code} value={r.code}>{r.libelle}</option>)}</Select></Field>
            <Field label="Montant (€)"><Input type="number" step="0.01" value={edit.montant ?? ''} onChange={(e) => setEdit({ ...edit, montant: e.target.value })} /></Field>
            <Field label="Quantité / surface" hint="Calcul : quantité × tarif"><Input type="number" step="0.0001" value={edit.quantite ?? ''} onChange={(e) => setEdit({ ...edit, quantite: e.target.value })} /></Field>
            <Field label="Tarif unitaire"><Input type="number" step="0.0001" value={edit.tarif_unitaire ?? ''} onChange={(e) => setEdit({ ...edit, tarif_unitaire: e.target.value })} /></Field>
            <Field label="Date d'effet"><Input type="date" value={edit.date_effet?.slice(0, 10) || ''} onChange={(e) => setEdit({ ...edit, date_effet: e.target.value })} /></Field>
            <Field label="Date de fin"><Input type="date" value={edit.date_fin?.slice(0, 10) || ''} onChange={(e) => setEdit({ ...edit, date_fin: e.target.value })} /></Field>
            <Field label="Libellé" className="col-span-2"><Input value={edit.libelle || ''} onChange={(e) => setEdit({ ...edit, libelle: e.target.value })} /></Field>
            <Field label="Imputation budgétaire" className="col-span-2"><Input value={edit.imputation || ''} onChange={(e) => setEdit({ ...edit, imputation: e.target.value })} /></Field>
          </div>
        </MotifModal>
      )}
      {del && <MotifModal title="Supprimer cette ligne ?" confirm="Supprimer" onCancel={() => setDel(null)} onConfirm={async (motif) => { await api.delete(`/contrats/${c.id}/conditions/${del.id}`, { params: { motif } }); setDel(null); reload(); }}><p className="text-body-md">La ligne « {label('rubrique', del.rubrique_code)} — {eur(del.montant)} » sera supprimée ; l'opération est conservée dans l'historique.</p></MotifModal>}
    </Card>
  );
}

function VieTab({ c, w, reload, openModal }: { c: any; w: boolean; reload: () => void; openModal: (m: string) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
      <Card>
        <SectionTitle title="Avenants" action={w && <Btn size="sm" icon={<Plus size={14} />} onClick={() => openModal('avenant')}>Ajouter</Btn>} />
        <DataTable rows={c.avenants} empty="Aucun avenant." cols={[{ key: 'numero', label: 'N°' }, { key: 'date_effet', label: "Date d'effet", render: (a: any) => dateFr(a.date_effet) }, { key: 'objet', label: 'Objet' }]} />
        <p className="text-body-sm text-on-surface-variant mt-space-sm">Une modification contractuelle substantielle passe par un avenant ; une simple correction administrative se fait via « Modifier » (motif exigé, historisée).</p>
      </Card>
      <Card>
        <SectionTitle title="Actes administratifs liés" action={w && <Btn size="sm" icon={<Plus size={14} />} onClick={() => openModal('acte')}>Ajouter</Btn>} />
        <DataTable rows={c.actes} empty="Aucun acte." cols={[{ key: 'type', label: 'Type' }, { key: 'reference', label: 'Référence' }, { key: 'date_acte', label: 'Date', render: (a: any) => dateFr(a.date_acte) }, { key: 'objet', label: 'Objet' }]} />
      </Card>
      <Card className="lg:col-span-2">
        <SectionTitle icon={<Lock size={20} />} title="Dépôt de garantie" action={w && <Btn size="sm" icon={<Pencil size={14} />} onClick={() => openModal('depot')}>{c.depot ? 'Modifier' : 'Renseigner'}</Btn>} />
        {c.depot ? <Dl items={[['Montant', eur(c.depot.montant)], ['Versé le', dateFr(c.depot.date_versement)], ['Mode de versement', c.depot.mode_versement], ['Référence', c.depot.reference], ['Restitué le', dateFr(c.depot.date_restitution)], ['Montant retenu', eur(c.depot.montant_retenu)], ['Commentaire', c.depot.commentaire]]} /> : <p className="text-on-surface-variant">Aucun dépôt de garantie enregistré.</p>}
        <p className="text-body-sm text-on-surface-variant mt-space-sm">La restitution financière relève de la Gestion Financière (DSF) ; un recouvrement au-delà du dépôt est un processus distinct.</p>
      </Card>
    </div>
  );
}

function EditModal({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: (r: any) => void }) {
  const types = useRefList('type_contrat'); const statuts = useRefList('statut_contrat'); const indices = useRefList('type_indice');
  const [f, setF] = useState<any>({ ...c }); const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const FIELDS = ['numero', 'position', 'type_code', 'statut_code', 'objet', 'gratuit', 'date_signature', 'date_debut', 'date_fin', 'fin_evenement', 'date_entree', 'date_sortie', 'date_debut_quittancement', 'periodicite', 'indice_type', 'date_revision_prochaine', 'service_code', 'direction', 'gestionnaire', 'commentaire'];
  const d = (k: string) => (f[k] ? String(f[k]).slice(0, 10) : '');
  return (
    <MotifModal title="Corriger / modifier le contrat" label="Motif de la correction" confirm="Enregistrer la correction" onCancel={onClose} required={c.statut_code === 'en_cours'}
      onConfirm={async (motif) => {
        try { const body: any = { motif }; for (const k of FIELDS) body[k] = f[k] ?? null; const r = await api.put(`/contrats/${c.id}`, body); toast('Correction enregistrée'); onSaved(r.data); } catch (e) { toast(errMsg(e), 'error'); }
      }}>
      <Notice>Une correction sur un contrat actif est auditée : l'ancienne valeur, votre identité, la date et ce motif sont conservés.</Notice>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <Field label="N° de contrat"><Input value={f.numero || ''} onChange={(e) => set('numero', e.target.value)} /></Field>
        <Field label="Statut"><Select value={f.statut_code || ''} onChange={(e) => set('statut_code', e.target.value)}>{statuts.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type_code || ''} onChange={(e) => set('type_code', e.target.value)}><option value="">—</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
        <Field label="Position"><Select value={f.position} onChange={(e) => set('position', e.target.value)}><option value="bailleur">Bailleur</option><option value="preneur">Preneur</option></Select></Field>
        <Field label="Objet" className="sm:col-span-2"><Textarea rows={2} value={f.objet || ''} onChange={(e) => set('objet', e.target.value)} /></Field>
        <Field label="Début"><Input type="date" value={d('date_debut')} onChange={(e) => set('date_debut', e.target.value)} /></Field>
        <Field label="Fin"><Input type="date" value={d('date_fin')} onChange={(e) => set('date_fin', e.target.value)} /></Field>
        <Field label="Entrée dans les lieux"><Input type="date" value={d('date_entree')} onChange={(e) => set('date_entree', e.target.value)} /></Field>
        <Field label="Sortie"><Input type="date" value={d('date_sortie')} onChange={(e) => set('date_sortie', e.target.value)} /></Field>
        <Field label="Début de quittancement"><Input type="date" value={d('date_debut_quittancement')} onChange={(e) => set('date_debut_quittancement', e.target.value)} /></Field>
        <Field label="Périodicité"><Select value={f.periodicite} onChange={(e) => set('periodicite', e.target.value)}><option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option></Select></Field>
        <Field label="Indice de révision"><Select value={f.indice_type || ''} onChange={(e) => set('indice_type', e.target.value)}><option value="">Aucun</option>{indices.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select></Field>
        <Field label="Prochaine révision"><Input type="date" value={d('date_revision_prochaine')} onChange={(e) => set('date_revision_prochaine', e.target.value)} /></Field>
        <Field label="Gestionnaire (identifiant)"><Input value={f.gestionnaire || ''} onChange={(e) => set('gestionnaire', e.target.value)} /></Field>
        <Field label="Direction / service"><Input value={f.direction || ''} onChange={(e) => set('direction', e.target.value)} /></Field>
      </div>
    </MotifModal>
  );
}

function ListModal({ kind, c, onClose, onSaved }: { kind: 'biens' | 'contractants'; c: any; onClose: () => void; onSaved: () => void }) {
  const roles = useRefList('role_contractant');
  const [v, setV] = useState<PickItem[]>(kind === 'biens' ? c.biens.map((b: any) => ({ id: b.id, label: b.designation, sub: b.adresse })) : c.contractants.map((x: any) => ({ id: x.id, label: `${x.nom}${x.prenom ? ` ${x.prenom}` : ''}`, role: x.role_code })));
  return (
    <MotifModal title={kind === 'biens' ? 'Biens du contrat' : 'Contractants du contrat'} confirm="Enregistrer" onCancel={onClose} label="Motif de la modification"
      onConfirm={async (motif) => {
        try { await api.put(`/contrats/${c.id}/${kind}`, kind === 'biens' ? { biens: v.map((x) => x.id), motif } : { contractants: v.map((x) => ({ id: x.id, role: x.role || 'titulaire' })), motif }); toast('Enregistré'); onSaved(); } catch (e) { toast(errMsg(e), 'error'); }
      }}>
      <EntityPicker kind={kind} value={v} onChange={setV} roles={kind === 'contractants' ? roles : undefined} />
    </MotifModal>
  );
}

function SimpleModal({ title, fields, url, onClose, onSaved }: { title: string; fields: [string, string, string?][]; url: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({});
  return (
    <Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={async () => { try { await api.post(url, f); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } }}>Enregistrer</Btn></>}>
      {fields.map(([k, l, t]) => <Field key={k} label={l}>{t === 'textarea' ? <Textarea rows={3} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <Input type={t || 'text'} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>)}
    </Modal>
  );
}

function DepotModal({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(c.depot || {});
  const d = (k: string) => (f[k] ? String(f[k]).slice(0, 10) : '');
  return (
    <Modal title="Dépôt de garantie" onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={async () => { try { await api.put(`/contrats/${c.id}/depot`, f); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } }}>Enregistrer</Btn></>}>
      <div className="grid grid-cols-2 gap-space-md">
        <Field label="Montant (€)"><Input type="number" step="0.01" value={f.montant ?? ''} onChange={(e) => setF({ ...f, montant: e.target.value })} /></Field>
        <Field label="Date de versement"><Input type="date" value={d('date_versement')} onChange={(e) => setF({ ...f, date_versement: e.target.value })} /></Field>
        <Field label="Mode de versement"><Input value={f.mode_versement || ''} onChange={(e) => setF({ ...f, mode_versement: e.target.value })} /></Field>
        <Field label="Référence"><Input value={f.reference || ''} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Date de restitution"><Input type="date" value={d('date_restitution')} onChange={(e) => setF({ ...f, date_restitution: e.target.value })} /></Field>
        <Field label="Montant retenu (partiel ou total)"><Input type="number" step="0.01" value={f.montant_retenu ?? ''} onChange={(e) => setF({ ...f, montant_retenu: e.target.value })} /></Field>
        <Field label="Commentaire" className="col-span-2"><Textarea rows={2} value={f.commentaire || ''} onChange={(e) => setF({ ...f, commentaire: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function GenEchModal({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 7));
  return (
    <Modal title="Générer les échéances manquantes" onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={async () => { try { const r = await api.post(`/contrats/${c.id}/echeances/generer`, { jusqu_a: m }); toast(`${r.data.crees} échéance(s) créée(s)`); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } }}>Générer</Btn></>}>
      <Field label="Jusqu'au mois de" hint="Les échéances existantes ne sont jamais modifiées. Prorata au jour à l'entrée et à la sortie."><Input type="month" value={m} onChange={(e) => setM(e.target.value)} /></Field>
    </Modal>
  );
}

function ClotureModal({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [statut, setStatut] = useState('clos');
  return (
    <MotifModal title={`Clôturer le contrat ${c.numero}`} confirm="Clôturer" label="Motif de la clôture (obligatoire)" onCancel={onClose}
      onConfirm={async (motif) => { try { const r = await api.post(`/contrats/${c.id}/cloturer`, { date_cloture: date, statut_code: statut, motif }); toast(`Contrat clôturé — ${r.data.echeances_annulees} échéance(s) future(s) annulée(s)`); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } }}>
      <div className="grid grid-cols-2 gap-space-md">
        <Field label="Date de clôture"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Nouveau statut"><Select value={statut} onChange={(e) => setStatut(e.target.value)}><option value="clos">Clos</option><option value="resilie">Résilié</option></Select></Field>
      </div>
      <Notice tone="warn">Les échéances planifiées après cette date seront annulées. Les échéances déjà émises ne sont pas modifiées.</Notice>
    </MotifModal>
  );
}
