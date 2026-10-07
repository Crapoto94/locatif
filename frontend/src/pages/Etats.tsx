import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { fileUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useLabel } from '../lib/refs';
import { currentPeriode, eur, moisLabel, num } from '../lib/format';
import { Card, PageHeader, Kpi, Input, Loading, ErrorBox, Notice, SectionTitle, DataTable } from '../components/ui';

export default function Etats() {
  const label = useLabel();
  const [annee, setAnnee] = useState(new Date().getFullYear()); const [periode, setPeriode] = useState(currentPeriode());
  const { data: a, loading, error, reload } = useFetch<any>('/etats/annuel', { annee });
  const { data: m } = useFetch<any>('/etats/mensuel', { periode });
  const max = a ? Math.max(1, ...a.par_mois.map((x: any) => x.loyers + x.charges)) : 1;
  const btn = 'h-9 px-space-md rounded text-label-md font-medium inline-flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-container-highest';

  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'États & statistiques']} title="États & statistiques"
        actions={<label className="flex items-center gap-2 text-body-md">Année<Input type="number" className="w-24" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} /></label>} />
      <Notice>{a?.nota || 'Montants attendus / échéancés — ce ne sont pas des encaissements.'} Le drill-down depuis chaque indicateur reste à valider avec AFLC.</Notice>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !a ? <Loading /> : a && (
        <>
          <Card className="my-space-md">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-space-lg">
              <Kpi label="Recettes attendues" value={eur(a.recettes_attendues.total, 0)} />
              <Kpi label="Dont loyers" value={eur(a.recettes_attendues.loyers, 0)} />
              <Kpi label="Dont charges" value={eur(a.recettes_attendues.charges, 0)} />
              <Link to="/contrats?statut=en_cours"><Kpi label="Contrats actifs" value={num(a.contrats_actifs)} /></Link>
              <Kpi label={`Créés / clôturés en ${a.annee}`} value={`${a.contrats_crees} / ${a.contrats_clotures}`} />
            </div>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
            <Card className="lg:col-span-2">
              <SectionTitle title={`Recettes attendues par mois — ${a.annee}`} sub="Loyers et charges séparés" />
              {a.par_mois.length === 0 ? <div className="text-on-surface-variant py-space-lg text-center">Aucune échéance.</div> : (
                <div className="flex items-end gap-2 h-48">
                  {a.par_mois.map((x: any) => (
                    <div key={x.periode} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${moisLabel(x.periode)} — loyers ${eur(x.loyers)}, charges ${eur(x.charges)}`}>
                      <div className="w-full flex flex-col justify-end h-40">
                        <div className="bg-secondary-container rounded-t" style={{ height: `${(x.charges / max) * 100}%` }} />
                        <div className="bg-primary-container" style={{ height: `${(x.loyers / max) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-on-surface-variant">{moisLabel(x.periode).slice(0, 4)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-space-md text-body-sm mt-space-sm"><span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary-container inline-block" />Loyers</span><span className="flex items-center gap-1"><span className="w-3 h-3 bg-secondary-container inline-block" />Charges</span></div>
            </Card>
            <Card>
              <SectionTitle title="Contrats actifs par type" />
              {a.par_type.map((t: any) => <div key={t.type} className="flex justify-between py-1.5 border-b border-surface-container-low last:border-0"><span>{label('type_contrat', t.type)}</span><strong className="tabular-nums">{t.nb}</strong></div>)}
            </Card>
          </div>
        </>
      )}
      <Card className="mt-space-lg">
        <SectionTitle title="État mensuel de facturation (rôle)" action={<div className="flex items-center gap-space-sm"><input type="month" value={periode} onChange={(e) => e.target.value && setPeriode(e.target.value)} className="h-9 px-2 rounded bg-surface-container-low" />
          <a href={fileUrl(`/etats/mensuel/export.xlsx?periode=${periode}`)} className={btn}><Download size={16} />Excel</a>
          <a href={fileUrl(`/etats/mensuel/export.pdf?periode=${periode}`)} className={btn}><Download size={16} />PDF</a></div>} />
        {m && <>
          <div className="text-body-md mb-space-sm">{moisLabel(periode)} — Loyers <strong>{eur(m.totaux.loyers)}</strong> • Charges <strong>{eur(m.totaux.charges)}</strong> • Total <strong className="text-primary">{eur(m.totaux.total)}</strong></div>
          <DataTable rows={m.lignes.map((l: any, i: number) => ({ ...l, id: i }))} empty="Aucune échéance pour ce mois." cols={[
            { key: 'n', label: 'Contrat', render: (l: any) => <strong className="tabular-nums">{l.numero}</strong> }, { key: 'c', label: 'Contractant', render: (l: any) => l.contractant || '—' },
            { key: 'b', label: 'Bien', render: (l: any) => <span className="text-body-sm">{l.bien || '—'}</span> },
            { key: 'l', label: 'Loyer', align: 'right', render: (l: any) => eur(l.montant_loyer) }, { key: 'ch', label: 'Charges', align: 'right', render: (l: any) => eur(l.montant_charges) }, { key: 't', label: 'Total', align: 'right', render: (l: any) => <strong>{eur(l.montant_total)}</strong> },
          ]} />
        </>}
      </Card>
    </>
  );
}
