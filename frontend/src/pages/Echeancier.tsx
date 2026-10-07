import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarPlus, Search } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch, useDebounced } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { currentPeriode, shiftPeriode, moisLabel, eur, dateFr } from '../lib/format';
import TitreLink from '../components/TitreLink';
import { Card, PageHeader, DataTable, Pagination, Btn, Badge, Loading, ErrorBox, Input, Select, Kpi, toast, MotifModal, Field } from '../components/ui';

const STATUTS: Record<string, [string, any]> = { planifiee: ['Planifiée', 'neutral'], emise: ['Émise', 'info'], titree: ['Titrée', 'success'], echue_non_emise: ['Échue (non émise)', 'warn'], annulee: ['Annulée', 'muted'] };

export default function Echeancier() {
  const { can } = useAuth();
  const [periode, setPeriode] = useState(currentPeriode());
  const [statut, setStatut] = useState(''); const [paiement, setPaiement] = useState(''); const [q, setQ] = useState(''); const [prorata, setProrata] = useState(false); const [anomalie, setAnomalie] = useState(false); const [offset, setOffset] = useState(0);
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch<any>('/echeancier', { periode, statut, paiement, q: dq, prorata: prorata ? 'oui' : '', anomalie: anomalie ? 'oui' : '', offset, limit: 50 });
  const { data: mois } = useFetch<any[]>('/echeancier/mois', { annee: periode.slice(0, 4) });
  const [edit, setEdit] = useState<any | null>(null);
  const change = (p: string) => { setPeriode(p); setOffset(0); };

  const generer = async () => { try { const r = await api.post('/echeancier/generer-mois', { periode }); toast(`${r.data.crees} échéance(s) générée(s) pour ${r.data.contrats} contrats`); reload(); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <>
      <PageHeader crumbs={['Finances & quittancement', 'Échéancier']} title={`Échéancier — ${moisLabel(periode)}`}
        actions={<>
          <div className="bg-surface-container-low p-1 rounded-lg flex items-center shadow-inner">
            <Btn size="sm" variant="ghost" onClick={() => change(shiftPeriode(periode, -1))} icon={<ChevronLeft size={16} />} />
            <input type="month" value={periode} onChange={(e) => e.target.value && change(e.target.value)} className="bg-transparent text-body-md px-2 focus:outline-none" />
            <Btn size="sm" variant="ghost" onClick={() => change(shiftPeriode(periode, 1))} icon={<ChevronRight size={16} />} />
          </div>
          {can('echeancier.write') && <Btn icon={<CalendarPlus size={16} />} onClick={generer}>Générer le mois</Btn>}
        </>} />
      <Card className="mb-space-lg">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-lg">
          <Kpi label="Échéances" value={data?.total ?? '—'} />
          <Kpi label="Loyers" value={eur(data?.totaux?.loyers)} />
          <Kpi label="Charges" value={eur(data?.totaux?.charges)} />
          <Kpi label="Total attendu" value={eur(data?.totaux?.total)} sub={<span>Attendu / échéancé — hors encaissements</span>} />
        </div>
      </Card>
      {mois && mois.length > 0 && (
        <Card className="mb-space-lg">
          <div className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-space-sm">Année {periode.slice(0, 4)} — total par mois</div>
          <div className="grid grid-cols-6 lg:grid-cols-12 gap-1">
            {mois.map((m) => { const max = Math.max(...mois.map((x) => x.total)); return (
              <button key={m.periode} onClick={() => change(m.periode)} className={`rounded p-1.5 text-center hover:bg-surface-container-high ${m.periode === periode ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low'}`}>
                <div className="text-[10px] uppercase">{moisLabel(m.periode).slice(0, 4)}</div>
                <div className="h-8 flex items-end justify-center"><div className={`w-3 rounded-sm ${m.periode === periode ? 'bg-on-primary' : 'bg-secondary'}`} style={{ height: `${Math.max(8, (m.total / max) * 100)}%` }} /></div>
                <div className="text-[10px] tabular-nums">{eur(m.total, 0)}</div>
              </button>); })}
          </div>
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap gap-space-sm mb-space-md">
          <div className="relative flex-1 min-w-[220px]"><Search size={16} className="absolute left-2.5 top-2.5 text-outline" /><Input className="pl-8" placeholder="Contrat ou contractant…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} /></div>
          <Select className="w-52" value={paiement} onChange={(e) => { setPaiement(e.target.value); setOffset(0); }}><option value="">Paiement : tous</option><option value="paye">Titres payés</option><option value="non_paye">Titres non payés</option><option value="rejete">Titres rejetés</option></Select>
          <Select className="w-48" value={statut} onChange={(e) => { setStatut(e.target.value); setOffset(0); }}><option value="">Tous statuts</option>{Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select>
          <label className="flex items-center gap-1.5 text-body-md"><input type="checkbox" checked={prorata} onChange={(e) => setProrata(e.target.checked)} />Proratisées</label>
          <label className="flex items-center gap-1.5 text-body-md"><input type="checkbox" checked={anomalie} onChange={(e) => setAnomalie(e.target.checked)} />Anomalies</label>
        </div>
        {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <DataTable rows={data?.rows || []} rowClass={(e: any) => (e.anomalie ? 'bg-error-container/30' : '')} cols={[
              { key: 'c', label: 'Contrat', render: (e: any) => <Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${e.contrat_id}`}>{e.contrat_numero}</Link> },
              { key: 'ct', label: 'Contractant / bien', render: (e: any) => <div><div className="font-semibold">{e.contractants || '—'}</div><div className="text-[11px] text-on-surface-variant max-w-xs truncate">{e.biens}</div></div> },
              { key: 'p', label: 'Période', render: (e: any) => <div><div>{e.libelle}</div><div className="text-[11px] text-on-surface-variant">{dateFr(e.periode_debut)} → {dateFr(e.periode_fin)}</div></div> },
              { key: 'l', label: 'Loyer', align: 'right', render: (e: any) => eur(e.montant_loyer) },
              { key: 'ch', label: 'Charges', align: 'right', render: (e: any) => eur(e.montant_charges) },
              { key: 'pr', label: 'Prorata', align: 'right', render: (e: any) => (e.prorata ? <Badge tone="warn">{e.prorata_jours}/{e.prorata_base} j</Badge> : '—') },
              { key: 't', label: 'Total', align: 'right', render: (e: any) => <strong>{eur(e.montant_total)}</strong> },
              { key: 'titre', label: 'Titre SEDIT / paiement', render: (e: any) => <TitreLink e={e} /> },
              { key: 's', label: 'Statut', render: (e: any) => { const [l, t] = STATUTS[e.statut] || [e.statut, 'neutral']; return <div className="flex flex-col gap-0.5"><Badge tone={t}>{l}</Badge>{e.anomalie && <span className="text-[11px] text-error max-w-[220px]">{e.anomalie}</span>}</div>; } },
              { key: 'a', label: '', render: (e: any) => can('echeancier.write') && ['planifiee', 'echue_non_emise'].includes(e.statut) && <Btn size="sm" variant="ghost" onClick={() => setEdit({ ...e })}>Ajuster</Btn> },
            ]} />
            <Pagination total={data?.total || 0} limit={50} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      {edit && (
        <MotifModal title={`Ajuster l'échéance — ${edit.contrat_numero}`} label="Motif de l'ajustement" confirm="Enregistrer" onCancel={() => setEdit(null)}
          onConfirm={async (motif) => { try { await api.put(`/echeancier/${edit.id}`, { montant_loyer: Number(edit.montant_loyer), montant_charges: Number(edit.montant_charges), motif }); setEdit(null); reload(); toast('Échéance ajustée'); } catch (e) { toast(errMsg(e), 'error'); } }}>
          <div className="grid grid-cols-2 gap-space-md">
            <Field label="Loyer (€)"><Input type="number" step="0.01" value={edit.montant_loyer} onChange={(e) => setEdit({ ...edit, montant_loyer: e.target.value })} /></Field>
            <Field label="Charges (€)"><Input type="number" step="0.01" value={edit.montant_charges} onChange={(e) => setEdit({ ...edit, montant_charges: e.target.value })} /></Field>
          </div>
        </MotifModal>
      )}
    </>
  );
}
