import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PlayCircle, RefreshCw, CheckCircle2, Lock, AlertOctagon, Download, Undo2, MinusCircle } from 'lucide-react';
import { api, errMsg, fileUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { currentPeriode, shiftPeriode, moisLabel, eur, dateTimeFr } from '../lib/format';
import { Card, PageHeader, Btn, Badge, Loading, ErrorBox, Notice, MotifModal, toast, SectionTitle } from '../components/ui';

const ETAPES = [['preparation', 'Préparation du terme'], ['controle', 'Contrôle de conformité'], ['correction', 'Arbitrage des anomalies'], ['validee', 'Validation locative']];

export default function Campagne() {
  const { can } = useAuth();
  const [periode, setPeriode] = useState(currentPeriode()); const [filtre, setFiltre] = useState<'toutes' | 'anomalies' | 'prorata' | 'retirees'>('toutes');
  const { data: c, loading, error, reload } = useFetch<any>(`/campagne/${periode}`);
  const { data: lignes, reload: reloadLignes } = useFetch<any[]>(c && c.statut !== 'non_preparee' ? `/campagne/${periode}/lignes` : null);
  const [retrait, setRetrait] = useState<any | null>(null); const [busy, setBusy] = useState(false);
  const refresh = () => { reload(); reloadLignes(); };
  const act = async (path: string, ok: string) => { setBusy(true); try { await api.post(`/campagne/${periode}/${path}`); toast(ok); refresh(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };

  const prep = c && c.statut !== 'non_preparee'; const validee = c?.statut === 'validee';
  const idx = prep ? ETAPES.findIndex((e) => e[0] === c.statut) : -1;
  const rows = (lignes || []).filter((l) => filtre === 'toutes' ? true : filtre === 'anomalies' ? l.anomalie && !l.campagne_retiree : filtre === 'prorata' ? l.prorata : l.campagne_retiree);

  return (
    <>
      <PageHeader crumbs={['Finances & quittancement', 'Campagne mensuelle']} title={`Campagne mensuelle — ${moisLabel(periode).toUpperCase()}`}
        actions={<>
          <div className="bg-surface-container-low p-1 rounded-lg flex items-center shadow-inner">
            <Btn size="sm" variant="ghost" onClick={() => setPeriode(shiftPeriode(periode, -1))} icon={<ChevronLeft size={16} />} />
            <input type="month" value={periode} onChange={(e) => e.target.value && setPeriode(e.target.value)} className="bg-transparent text-body-md px-2 focus:outline-none" />
            <Btn size="sm" variant="ghost" onClick={() => setPeriode(shiftPeriode(periode, 1))} icon={<ChevronRight size={16} />} />
          </div>
          {can('campagne.write') && !validee && <Btn variant={prep ? 'secondary' : 'primary'} icon={<PlayCircle size={16} />} disabled={busy} onClick={() => act('preparer', 'Campagne préparée')}>{prep ? 'Actualiser la préparation' : 'Préparer la campagne'}</Btn>}
          {can('campagne.write') && prep && !validee && <Btn icon={<RefreshCw size={16} />} disabled={busy} onClick={() => act('controler', 'Contrôle effectué')}>Lancer le contrôle</Btn>}
          {prep && can('etats.read') && <a href={fileUrl(`/etats/mensuel/export.xlsx?periode=${periode}`)} className="h-9 px-space-md rounded text-label-md font-medium inline-flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-container-highest"><Download size={16} />Synthèse Excel</a>}
          {can('campagne.valider') && prep && !validee && <Btn variant="primary" icon={<CheckCircle2 size={16} />} disabled={busy || c.bloquantes > 0} onClick={() => act('valider', 'Campagne validée')}>Valider la campagne locative</Btn>}
        </>} />

      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !c ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm mb-space-md">
            {ETAPES.map(([k, l], i) => {
              const etat = !prep ? 'avenir' : validee ? 'faite' : i < idx ? 'faite' : i === idx ? 'cours' : 'avenir';
              return (
                <div key={k} className={`rounded-lg p-space-sm flex items-center gap-space-sm ${etat === 'cours' ? (c.anomalies && k === 'correction' ? 'bg-error-container' : 'bg-primary-container text-on-primary') : etat === 'faite' ? 'bg-secondary-fixed' : 'bg-surface-container-low opacity-70'}`}>
                  <div className="text-lg">{etat === 'faite' ? <CheckCircle2 size={22} /> : k === 'validee' ? <Lock size={22} /> : <span className="font-bold">{i + 1}</span>}</div>
                  <div><div className="text-label-sm uppercase">Étape {i + 1} • {etat === 'faite' ? 'Terminée' : etat === 'cours' ? 'En cours' : 'À venir'}</div><div className="text-headline-sm font-bold">{l}</div></div>
                </div>
              );
            })}
          </div>
          <Notice><strong>Frontière de responsabilité :</strong> la campagne Gestion Locative couvre la préparation, le contrôle, la correction des anomalies et la validation locative. La suite financière (transmission, pré-titres, statuts, accusés) est à spécifier avec la DSF / FILIEN-SEDIT.</Notice>
          {!prep ? <Card className="mt-space-md"><div className="text-center py-space-xl text-on-surface-variant">Aucune campagne préparée pour {moisLabel(periode)}.{can('campagne.write') && ' Cliquez sur « Préparer la campagne » pour générer et rattacher les échéances du mois.'}</div></Card> : (
            <>
              <Card className="mt-space-md">
                <div className="flex flex-wrap items-center gap-x-space-lg gap-y-space-sm text-body-md">
                  <span>Loyer brut : <strong className="tabular-nums">{eur(c.loyers)}</strong></span><span>Charges : <strong className="tabular-nums">{eur(c.charges)}</strong></span>
                  <span>Total échu : <strong className="text-secondary tabular-nums">{eur(c.total)}</strong></span><span>Dossiers : <strong>{c.nb}</strong></span>
                  {c.retirees > 0 && <Badge tone="muted">{c.retirees} retirée(s)</Badge>}
                  {c.anomalies > 0 ? <Badge tone="error">{c.anomalies} anomalie(s){c.bloquantes ? ` dont ${c.bloquantes} bloquante(s)` : ''}</Badge> : <Badge tone="success">Aucune anomalie</Badge>}
                  <span className="ml-auto text-body-sm text-on-surface-variant">Conformité {c.taux_conformite} %{validee ? ` • validée par ${c.validee_par} le ${dateTimeFr(c.validee_le)}` : ''}</span>
                </div>
              </Card>
              <Card className="mt-space-md">
                <div className="flex gap-1 mb-space-md">
                  {([['toutes', `Toutes (${lignes?.length ?? 0})`], ['anomalies', 'Anomalies'], ['prorata', 'Proratisées'], ['retirees', 'Retirées']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setFiltre(k)} className={`px-space-sm py-1 rounded text-label-md ${filtre === k ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}>{l}</button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-body-md border-collapse">
                    <thead><tr className="bg-surface-container-high text-on-surface-variant text-label-sm uppercase tracking-wider">
                      {['État', 'Réf. contrat', 'Contractant', 'Bien loué & localisation', 'Loyer', 'Charges', 'Prorata', 'Total échu', 'Contrôle', ''].map((h, i) => <th key={i} className={`py-2.5 px-space-sm ${[4, 5, 6, 7].includes(i) ? 'text-right' : ''}`}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {rows.map((l) => (
                        <tr key={l.id} className={`border-b border-surface-container-low align-top ${l.campagne_retiree ? 'opacity-50' : l.anomalie ? 'bg-error-container/30' : ''}`}>
                          <td className="py-2 px-space-sm">{l.campagne_retiree ? <MinusCircle size={20} className="text-outline" /> : l.anomalie ? <AlertOctagon size={20} className="text-error" /> : <CheckCircle2 size={20} className="text-secondary" />}</td>
                          <td className="py-2 px-space-sm"><Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${l.contrat_id}`}>{l.contrat_numero}</Link></td>
                          <td className="py-2 px-space-sm"><div className="font-semibold">{l.contractant || '—'}</div>{l.adresse_contractant && <div className="text-[11px] text-on-surface-variant max-w-[200px]">{l.adresse_contractant}</div>}</td>
                          <td className="py-2 px-space-sm text-body-sm max-w-xs">{l.bien || '—'}</td>
                          <td className="py-2 px-space-sm text-right tabular-nums">{eur(l.montant_loyer)}</td>
                          <td className="py-2 px-space-sm text-right tabular-nums">{eur(l.montant_charges)}</td>
                          <td className="py-2 px-space-sm text-right">{l.prorata ? <Badge tone="warn">{l.prorata_jours} j</Badge> : '—'}</td>
                          <td className="py-2 px-space-sm text-right font-bold tabular-nums">{eur(l.montant_total)}</td>
                          <td className="py-2 px-space-sm text-body-sm max-w-[240px]">{l.anomalie ? <span className="text-error">{l.anomalie}</span> : <span className="text-on-surface-variant">Conforme</span>}</td>
                          <td className="py-2 px-space-sm text-right">
                            {can('campagne.write') && !validee && (l.campagne_retiree
                              ? <Btn size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={async () => { await api.post(`/campagne/${periode}/echeances/${l.id}/reprendre`, {}); refresh(); }}>Reprendre</Btn>
                              : <Btn size="sm" variant="ghost" onClick={() => setRetrait(l)}>Retirer</Btn>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length === 0 && <div className="text-center text-on-surface-variant py-space-lg">Aucune ligne.</div>}
                </div>
              </Card>
              <Card className="mt-space-md">
                <SectionTitle title="Journal d'audit & traçabilité des arbitrages" sub={`${c.journal?.length || 0} opération(s) enregistrée(s)`} />
                {(c.journal || []).map((j: any) => (
                  <div key={j.id} className="py-2 flex justify-between border-b border-surface-container-low last:border-0 text-body-md">
                    <div><span className="font-semibold">{({ ajout: 'Préparation', retrait: 'Échéance retirée', reprise: 'Échéance reprise', controle: 'Contrôle', validation: 'Validation locative' } as any)[j.action] || j.action}</span>{j.echeance_id ? ` (échéance ${j.echeance_id})` : ''}<div className="text-body-sm text-on-surface-variant">{j.utilisateur} — {j.motif}</div></div>
                    <span className="text-body-sm text-on-surface-variant tabular-nums">{dateTimeFr(j.ts)}</span>
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}
      {retrait && (
        <MotifModal title={`Retirer ${retrait.contrat_numero} de la campagne`} label="Motif du retrait" confirm="Retirer" onCancel={() => setRetrait(null)}
          onConfirm={async (motif) => { try { await api.post(`/campagne/${periode}/echeances/${retrait.id}/retirer`, { motif }); setRetrait(null); refresh(); } catch (e) { toast(errMsg(e), 'error'); } }}>
          <Notice>L'échéance ne sera plus incluse dans cette campagne ; l'opération est tracée et réversible tant que la campagne n'est pas validée.</Notice>
        </MotifModal>
      )}
    </>
  );
}
