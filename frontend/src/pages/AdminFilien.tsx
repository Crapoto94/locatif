import { useEffect, useState } from 'react';
import { Plus, Trash2, Download, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { api, errMsg, fileUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { dateTimeFr, eur, moisLabel } from '../lib/format';
import { Card, PageHeader, Tabs, Btn, Badge, Input, Select, Field, Notice, Loading, ErrorBox, SectionTitle, DataTable, MotifModal, toast } from '../components/ui';

// Paramétrage FILIEN (interface SEDIT GF « Finances amont ») : en-tête du fichier, valeurs par défaut des mouvements,
// libellés, pièces jointes / dossier de dépôt, imputations budgétaires par rubrique, historique des exports.
// La règle de chaque champ (balise FILIEN) est dans la skill « filien » (C:\dev\_skills\filien).

export default function AdminFilien() {
  const [tab, setTab] = useState('param');
  const { data, loading, error, reload } = useFetch<any>('/filien/config');
  return (
    <>
      <PageHeader crumbs={['Configuration', 'Paramétrage FILIEN']} title="Paramétrage FILIEN (facturation vers SEDIT)" />
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : data && (
        <>
          {data.problemes.length > 0 && <div className="mb-space-md"><Notice tone="warn"><strong>Paramétrage incomplet — la génération est bloquée :</strong><ul className="list-disc ml-4">{data.problemes.map((p: string) => <li key={p}>{p}</li>)}</ul></Notice></div>}
          <Tabs tabs={[{ id: 'param', label: 'Paramètres du fichier' }, { id: 'imputations', label: 'Imputations budgétaires', badge: data.imputations.length }, { id: 'exports', label: 'Historique des exports' }]} active={tab} onChange={setTab} />
          {tab === 'param' && <Parametres data={data} onSaved={reload} />}
          {tab === 'imputations' && <Imputations data={data} onSaved={reload} />}
          {tab === 'exports' && <Exports />}
        </>
      )}
    </>
  );
}

const AVANCEMENTS = [['1', '1 — Prévision'], ['2', '2 — Pré-engagé'], ['3', '3 — Engagé'], ['4', '4 — Facturé'], ['5', '5 — Pré-mandaté / pré-titré']];

function Parametres({ data, onSaved }: { data: any; onSaved: () => void }) {
  const { can } = useAuth(); const edit = can('admin.filien');
  const [f, setF] = useState<any>(data.config); const [busy, setBusy] = useState(false); const [test, setTest] = useState<any | null>(null);
  useEffect(() => setF(data.config), [data.config]);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const txt = (k: string, extra: Record<string, any> = {}) => <Input value={f[k] ?? ''} disabled={!edit} onChange={(e) => set(k, e.target.value)} {...extra} />;
  const chk = (k: string, label: string) => <label className="flex items-center gap-2 text-body-md"><input type="checkbox" disabled={!edit} checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked)} />{label}</label>;
  const toggleType = (code: string) => set('joindre_types', f.joindre_types.includes(code) ? f.joindre_types.filter((x: string) => x !== code) : [...f.joindre_types, code]);

  const save = async () => {
    setBusy(true);
    try { await api.put('/filien/config', { ...f, smb_mot_de_passe_defini: undefined }); toast('Paramétrage FILIEN enregistré'); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const tester = async () => {
    setBusy(true);
    try { setTest((await api.post('/filien/test-depot', { dossier_depot: f.dossier_depot, chemin_sedit: f.chemin_sedit, smb_utilisateur: f.smb_utilisateur, smb_domaine: f.smb_domaine, smb_mot_de_passe: f.smb_mot_de_passe })).data); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <Card>
          <SectionTitle title="En-tête du fichier" sub="Ligne /##/PARAM/… : où SEDIT doit intégrer les titres." />
          <div className="grid grid-cols-2 gap-space-md">
            <Field label="Code organisme" hint="2 chiffres (01 à 99), existant dans SEDIT">{txt('organisme', { maxLength: 2 })}</Field>
            <Field label="Code budget" hint="Code du budget SEDIT (ex. BA)">{txt('budget', { maxLength: 2, placeholder: 'BA' })}</Field>
            <Field label="Exercice" hint="Vide = année de la campagne"><Input type="number" disabled={!edit} value={f.exercice ?? ''} onChange={(e) => set('exercice', e.target.value)} placeholder="auto" /></Field>
            <Field label="Code avancement"><Select disabled={!edit} value={f.avancement} onChange={(e) => set('avancement', e.target.value)}>{AVANCEMENTS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select></Field>
          </div>
          <div className="flex flex-col gap-1 mt-space-md">
            {chk('rejet_dispo', 'Rejeter si dépassement du disponible')}{chk('rejet_ca', 'Rejeter si dépassement du C.A. maxi (hors marché)')}{chk('rejet_marche', 'Rejeter si dépassement du montant global du marché')}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Valeurs par défaut des mouvements" sub="Les compteurs avancent tout seuls après chaque génération : un numéro ne doit jamais être réutilisé." />
          <div className="grid grid-cols-2 gap-space-md">
            <Field label="Prochain n° de mouvement (/01/)" hint="Préfixe + chiffres, 10 car. max (LOC00001)">{txt('mouvement_prochain', { maxLength: 10 })}</Field>
            <Field label="Prochain titre interne (/13/)" hint="Doit être inédit dans SEDIT">{txt('titre_interne_prochain', { maxLength: 6 })}</Field>
            <Field label="Type (/02/)"><Select disabled={!edit} value={f.type} onChange={(e) => set('type', e.target.value)}><option value="R">R — Recette</option><option value="D">D — Dépense</option></Select></Field>
            <Field label="Monnaie (/06/)"><Select disabled={!edit} value={f.monnaie} onChange={(e) => set('monnaie', e.target.value)}><option value="E">E — Euros</option><option value="F">F — Francs</option></Select></Field>
            <Field label="Code calendrier (/05/)" hint="Doit exister dans SEDIT">{txt('calendrier', { maxLength: 2 })}</Field>
            <Field label="N° de pré-bordereau (/11/)" hint="4 chiffres, sans zéros ajoutés">{txt('pre_bordereau', { maxLength: 4 })}</Field>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Libellés" sub="Variables : {mois} {annee} {contrat} {contractant} {bien}. Chaque libellé est coupé à 40 caractères." />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
          <Field label="Libellé du mouvement (/04/)">{txt('libelle_mouvement')}</Field>
          <Field label="Objet du titre (/20/)">{txt('objet')}</Field>
          <Field label="Complément (/21/)">{txt('complement')}</Field>
        </div>
        <div className="flex flex-col gap-1 mt-space-md">
          {chk('detail_prestations', 'Détail des prestations pour l\'avis des sommes à payer dématérialisé (/500/ à /506/)')}
          {chk('tiers_solidaires', 'Ajouter les cotitulaires du contrat comme tiers solidaires (/183/ et /400/) — à n\'activer qu\'après essai dans SEDIT')}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Pièces jointes et dossier de dépôt" sub="Le fichier .filien.txt et ses pièces sont déposés ensemble dans un sous-dossier daté de ce dossier." />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
          <Field label="Dossier de dépôt (écriture par l'application)" hint={`Effectif : ${data.dossier_effectif}`}>{txt('dossier_depot', { placeholder: '\\\\serveur\\partage\\filien' })}</Field>
          <Field label="Chemin vu par SEDIT (/263/)" hint="Vide = identique au dossier de dépôt. À renseigner si SEDIT lit le partage sous un autre nom.">{txt('chemin_sedit', { placeholder: '\\\\serveur\\partage\\filien' })}</Field>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md mt-space-md">
          <Field label="Utilisateur SAMBA" hint="Obligatoire si l'application tourne sous Linux/Docker (un chemin \\serveur\partage n'y est pas un dossier). Vide = accès du compte du service.">{txt('smb_utilisateur', { autoComplete: 'off' })}</Field>
          <Field label="Mot de passe SAMBA" hint={f.smb_mot_de_passe_defini ? 'Défini (chiffré) — laisser vide pour le conserver' : 'Stocké chiffré, jamais réaffiché'}>
            <Input type="password" autoComplete="new-password" disabled={!edit} value={f.smb_mot_de_passe || ''} onChange={(e) => set('smb_mot_de_passe', e.target.value)} placeholder={f.smb_mot_de_passe_defini ? '••••••••' : ''} /></Field>
          <Field label="Domaine" hint="WORKGROUP si le serveur n'est pas dans un domaine">{txt('smb_domaine', { placeholder: 'WORKGROUP' })}</Field>
        </div>
        {edit && f.smb_mot_de_passe_defini && <label className="flex items-center gap-2 text-body-sm mt-1"><input type="checkbox" checked={Boolean(f.smb_effacer)} onChange={(e) => set('smb_effacer', e.target.checked)} />Effacer le mot de passe enregistré</label>}
        <div className="flex gap-space-sm items-center mt-space-sm">
          <Btn size="sm" disabled={busy} onClick={tester}>Tester l'écriture</Btn>
          {test && <span className={`flex items-center gap-1 text-body-sm ${test.ok ? 'text-secondary' : 'text-error'}`}>{test.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{test.message}</span>}
        </div>
        <div className="mt-space-md flex flex-col gap-1">
          {chk('joindre_detail', 'Joindre le « Détail de facture » (PDF généré pour chaque titre)')}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md mt-space-xs">
            <Field label="Type de pièce du détail (/264/…)" hint="011 = détail de facture ; vide = défaut SEDIT (002 en recette)">{txt('type_piece_detail', { maxLength: 3 })}</Field>
            <Field label="Type de pièce des autres PJ" hint="Vide = défaut SEDIT">{txt('type_piece_autres', { maxLength: 3 })}</Field>
            <Field label="Type de document (/266/)" hint="Doit exister dans « Type de document » (ex. MDT). Vide = saisi à l'exécution.">{txt('type_document', { maxLength: 10 })}</Field>
          </div>
          <div className="text-label-sm uppercase text-on-surface-variant tracking-wider mt-space-sm">Documents du contrat à joindre (le plus récent de chaque type, hors pièces sensibles)</div>
          <div className="flex flex-wrap gap-x-space-lg gap-y-1">{data.types_document.map((t: any) => (
            <label key={t.code} className="flex items-center gap-2 text-body-md"><input type="checkbox" disabled={!edit} checked={f.joindre_types.includes(t.code)} onChange={() => toggleType(t.code)} />{t.libelle}</label>))}</div>
          <p className="text-body-sm text-outline">Au plus 5 pièces par titre (limite FILIEN). Une pièce absente du stockage bloque la génération.</p>
        </div>
      </Card>

      {edit && <div><Btn variant="primary" disabled={busy} onClick={save}>Enregistrer le paramétrage</Btn></div>}
    </div>
  );
}

const VIDE = { rubrique: 'loyer', type_contrat: '', libelle: '', chapitre: '', nature: '', fonction: '', code_interne: '', type_mouvement: 'R', sens: 'R', structure: '', gestionnaire: '', destinataire: '', actif: true };

function Imputations({ data, onSaved }: { data: any; onSaved: () => void }) {
  const { can } = useAuth(); const edit = can('admin.filien');
  const [rows, setRows] = useState<any[]>(data.imputations.map((r: any) => ({ ...r, type_contrat: r.type_contrat || '' }))); const [busy, setBusy] = useState(false);
  const maj = (i: number, k: string, v: any) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    setBusy(true);
    try { await api.put('/filien/imputations', { imputations: rows.map((r) => ({ ...r, type_contrat: r.type_contrat || null })) }); toast('Imputations enregistrées'); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const cell = (i: number, k: string, w = 'w-24', max = 10) => <Input className={w} maxLength={max} disabled={!edit} value={rows[i][k] ?? ''} onChange={(e) => maj(i, k, e.target.value)} />;
  return (
    <Card>
      <SectionTitle title="Imputations budgétaires" sub="Une ligne FILIEN (/51/) par rubrique de l'échéance : le loyer et les charges peuvent avoir des imputations différentes. Une ligne « type de contrat » prime sur la ligne générale." />
      <Notice>Chapitre et nature sont obligatoires (balise /541/) ; la combinaison doit exister dans SEDIT pour le budget et l'exercice concernés, sinon la ligne est rejetée à l'intégration.</Notice>
      <div className="overflow-x-auto mt-space-md">
        <table className="w-full text-body-md border-collapse">
          <thead><tr className="bg-surface-container-high text-label-sm uppercase text-on-surface-variant">
            {['Rubrique', 'Type de contrat', 'Libellé ligne', 'Chapitre', 'Nature', 'Fonction', 'Code interne', 'Type', 'Sens', 'Structure', 'Gestionnaire', 'Destinataire', 'Actif', ''].map((h) => <th key={h} className="py-2 px-1 text-left font-medium">{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-b border-surface-container-low align-top">
              <td className="p-1"><Select className="w-36" disabled={!edit} value={r.rubrique} onChange={(e) => maj(i, 'rubrique', e.target.value)}>{data.rubriques.map((x: any) => <option key={x.code} value={x.code}>{x.libelle}</option>)}</Select></td>
              <td className="p-1"><Select className="w-44" disabled={!edit} value={r.type_contrat} onChange={(e) => maj(i, 'type_contrat', e.target.value)}><option value="">Tous les types</option>{data.types_contrat.map((x: any) => <option key={x.code} value={x.code}>{x.libelle}</option>)}</Select></td>
              <td className="p-1">{cell(i, 'libelle', 'w-32', 80)}</td><td className="p-1">{cell(i, 'chapitre')}</td><td className="p-1">{cell(i, 'nature')}</td><td className="p-1">{cell(i, 'fonction')}</td><td className="p-1">{cell(i, 'code_interne')}</td>
              <td className="p-1"><Select className="w-16" disabled={!edit} value={r.type_mouvement} onChange={(e) => maj(i, 'type_mouvement', e.target.value)}><option>R</option><option>E</option><option>I</option></Select></td>
              <td className="p-1"><Select className="w-16" disabled={!edit} value={r.sens} onChange={(e) => maj(i, 'sens', e.target.value)}><option>R</option><option>D</option></Select></td>
              <td className="p-1">{cell(i, 'structure')}</td><td className="p-1">{cell(i, 'gestionnaire')}</td><td className="p-1">{cell(i, 'destinataire')}</td>
              <td className="p-1 text-center pt-3"><input type="checkbox" disabled={!edit} checked={r.actif} onChange={(e) => maj(i, 'actif', e.target.checked)} /></td>
              <td className="p-1">{edit && <Btn size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />}</td>
            </tr>))}</tbody>
        </table>
        {rows.length === 0 && <div className="text-center text-on-surface-variant py-space-lg">Aucune imputation : la génération FILIEN est impossible tant qu'il n'y en a pas pour le loyer (et les charges, si elles sont facturées).</div>}
      </div>
      {edit && <div className="flex gap-space-sm mt-space-md">
        <Btn icon={<Plus size={14} />} onClick={() => setRows((r) => [...r, { ...VIDE, rubrique: r.some((x) => x.rubrique === 'loyer' && !x.type_contrat) ? 'charges' : 'loyer' }])}>Ajouter une imputation</Btn>
        <Btn variant="primary" disabled={busy} onClick={save}>Enregistrer les imputations</Btn>
      </div>}
    </Card>
  );
}

function Exports() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useFetch<any[]>('/filien/exports');
  const [annul, setAnnul] = useState<any | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <Card>
      <SectionTitle title="Historique des exports" sub="Chaque génération dépose un fichier FILIEN et ses pièces ; la copie du fichier reste téléchargeable ici." />
      <DataTable rows={data || []} empty="Aucun export généré." cols={[
        { key: 'p', label: 'Campagne', render: (e: any) => moisLabel(e.periode) },
        { key: 'n', label: 'Dossier', render: (e: any) => <div><div className="font-semibold">{e.nom}</div><div className="text-[11px] text-on-surface-variant break-all">{e.dossier}</div></div> },
        { key: 'm', label: 'Titres', render: (e: any) => <div>{e.nb_mouvements}<div className="text-[11px] text-on-surface-variant">{e.premier_mouvement} → {e.dernier_mouvement}</div></div> },
        { key: 'j', label: 'PJ', render: (e: any) => e.nb_pj },
        { key: 't', label: 'Total', align: 'right', render: (e: any) => eur(e.total) },
        { key: 'g', label: 'Généré', render: (e: any) => <div>{dateTimeFr(e.genere_le)}<div className="text-[11px] text-on-surface-variant">{e.genere_par}</div></div> },
        { key: 's', label: 'Statut', render: (e: any) => e.statut === 'annule' ? <Badge tone="muted">Annulé</Badge> : <Badge tone="success">Généré</Badge> },
        { key: 'a', label: '', render: (e: any) => <div className="flex gap-1">
          <a href={fileUrl(`/filien/exports/${e.id}/fichier`)} className="h-8 px-space-sm rounded text-label-md inline-flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-container-highest"><Download size={14} />.filien.txt</a>
          {e.statut === 'genere' && can('admin.filien') && <Btn size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => setAnnul(e)}>Annuler</Btn>}</div> },
      ]} />
      {annul && (
        <MotifModal title={`Annuler l'export ${annul.nom}`} label="Motif de l'annulation" confirm="Annuler l'export" onCancel={() => setAnnul(null)}
          onConfirm={async (motif) => { try { await api.post(`/filien/exports/${annul.id}/annuler`, { motif }); setAnnul(null); toast('Export annulé : les échéances sont de nouveau à facturer'); reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>
          <Notice tone="warn">Les échéances redeviennent « à émettre » et la campagne pourra être refacturée avec de nouveaux numéros. Le dossier est renommé (suffixe _ANNULE) mais pas supprimé. <strong>Si SEDIT a déjà intégré le fichier, ses titres n'en sont pas effacés.</strong></Notice>
        </MotifModal>
      )}
    </Card>
  );
}
