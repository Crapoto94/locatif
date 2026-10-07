import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, UserCog, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { dateFr, dateTimeFr } from '../lib/format';
import { Card, PageHeader, Tabs, Badge, Btn, Loading, ErrorBox, Pagination, Input, Select, Field, MotifModal, Modal, toast, Empty } from '../components/ui';

const TYPES: Record<string, string> = { fin_contrat: 'Fin de contrat', revision: 'Révision', assurance_expirante: 'Assurance expirante', document_manquant: 'Document manquant', vacance_prolongee: 'Vacance prolongée', renouvellement: 'Renouvellement', anomalie_echeancier: "Anomalie d'échéancier", anomalie_technique: 'Anomalie technique' };

export default function Alertes() {
  const { can, user } = useAuth(); const w = can('alertes.write');
  const [statut, setStatut] = useState('active'); const [type, setType] = useState(''); const [moi, setMoi] = useState(false); const [offset, setOffset] = useState(0);
  const { data, loading, error, reload } = useFetch<any>('/alertes', { statut, type, assigne: moi ? 'moi' : '', offset, limit: 30 });
  const { data: cpt, reload: reloadC } = useFetch<any[]>('/alertes/compteurs');
  const [traiter, setTraiter] = useState<any | null>(null); const [reaff, setReaff] = useState<any | null>(null); const [vers, setVers] = useState('');
  const refresh = () => { reload(); reloadC(); };
  const [ouvertes, setOuvertes] = useState<Set<number>>(new Set()); // alertes dont le détail est déroulé
  const basculer = (id: number) => setOuvertes((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const recalc = async () => { try { const r = await api.post('/alertes/recalculer', { notifier: true }); toast(`${r.data.creees} nouvelle(s) alerte(s)${r.data.notification?.envoyees ? ` — ${r.data.notification.envoyees} notifiée(s) par mail` : ''}`); refresh(); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'Alertes']} title="Centre des alertes" actions={w && <Btn icon={<RefreshCw size={16} />} onClick={recalc}>Recalculer & notifier</Btn>} />
      <Card className="mb-space-sm !py-2">
        <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-sm">
          <div className="flex gap-1">
            {[['active', 'À traiter'], ['traitee', 'Traitées']].map(([id, l]) => (
              <button key={id} onClick={() => { setStatut(id); setOffset(0); }} className={`px-space-sm py-1 rounded-lg text-body-md ${statut === id ? 'bg-primary-container text-on-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>{l}</button>
            ))}
          </div>
          <span className="w-px h-5 bg-outline-variant" />
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            <button onClick={() => { setType(''); setOffset(0); }} className={`px-space-sm py-0.5 rounded text-label-md ${!type ? 'bg-secondary text-on-secondary' : 'bg-surface-container-low hover:bg-surface-container-high'}`}>Toutes</button>
            {(cpt || []).map((c) => <button key={c.type} onClick={() => { setType(c.type); setOffset(0); }} className={`px-space-sm py-0.5 rounded text-label-md ${type === c.type ? 'bg-secondary text-on-secondary' : 'bg-surface-container-low hover:bg-surface-container-high'}`}>{TYPES[c.type] || c.type} <span className="opacity-70">{c.n}</span></button>)}
          </div>
          <label className="flex items-center gap-1.5 text-body-md whitespace-nowrap"><input type="checkbox" checked={moi} onChange={(e) => setMoi(e.target.checked)} />Mes alertes ({user?.username})</label>
        </div>
      </Card>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <>
          {!data?.rows?.length ? <Card><Empty>{statut === 'active' ? 'Aucune alerte à traiter.' : 'Aucune alerte traitée.'}</Empty></Card> : (
            <Card className="!p-0 overflow-hidden">
              {data.rows.map((a: any) => {
                const ouvert = ouvertes.has(a.id);
                return (
                  <div key={a.id} className="border-b border-surface-container-low last:border-0">
                    <div className="flex items-center gap-space-sm px-space-md py-1.5 hover:bg-surface-container-low min-w-0">
                      <Badge tone="neutral" className="flex-shrink-0">{TYPES[a.type] || a.type}</Badge>
                      <button onClick={() => basculer(a.id)} className="font-semibold text-primary text-left truncate min-w-0 flex-1 hover:underline" title={a.titre}>{a.titre}</button>
                      {a.objet_type && a.objet_id && <Link className="text-secondary font-semibold hover:underline whitespace-nowrap text-body-sm" to={`/${a.objet_type === 'bien' ? 'biens' : 'contrats'}/${a.objet_id}`}>{a.objet_libelle || `${a.objet_type} ${a.objet_id}`}</Link>}
                      {a.date_cible && <span className="text-body-sm tabular-nums whitespace-nowrap text-on-surface-variant">{dateFr(a.date_cible)}</span>}
                      {a.jours_restants !== null && a.statut === 'active' && <Badge tone={a.jours_restants < 0 ? 'error' : a.jours_restants < 30 ? 'warn' : 'info'} className="flex-shrink-0">{a.jours_restants < 0 ? `-${-a.jours_restants} j` : `J-${a.jours_restants}`}</Badge>}
                      {a.assigne_a && <span className="text-body-sm text-on-surface-variant whitespace-nowrap hidden lg:inline">{a.assigne_a}</span>}
                      {w && a.statut === 'active' && <>
                        <button className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant" title="Réaffecter" onClick={() => { setReaff(a); setVers(''); }}><UserCog size={16} /></button>
                        <Btn size="sm" variant="primary" icon={<CheckCircle2 size={14} />} onClick={() => setTraiter(a)}>Traiter</Btn>
                      </>}
                      <button className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant" title={ouvert ? 'Réduire' : 'Dérouler le détail'} onClick={() => basculer(a.id)}>{ouvert ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                    </div>
                    {ouvert && (
                      <div className="px-space-md pb-2 pl-12 text-body-md text-on-surface-variant">
                        {a.message && <p>{a.message}</p>}
                        {a.assigne_a && <p>Assignée à <strong className="text-on-surface">{a.assigne_a}</strong></p>}
                        {a.statut === 'traitee' && <p>Traitée par <strong>{a.traite_par}</strong> le {dateTimeFr(a.traite_le)} : {a.traitement}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
          <Pagination total={data?.total || 0} limit={30} offset={offset} onChange={setOffset} />
        </>
      )}
      {traiter && <MotifModal title="Traiter l'alerte" label="Action menée ou commentaire" confirm="Marquer comme traitée" onCancel={() => setTraiter(null)}
        onConfirm={async (t) => { try { await api.post(`/alertes/${traiter.id}/traiter`, { traitement: t }); setTraiter(null); refresh(); } catch (e) { toast(errMsg(e), 'error'); } }}><p className="text-body-md font-semibold">{traiter.titre}</p></MotifModal>}
      {reaff && <Modal title="Réaffecter l'alerte" onClose={() => setReaff(null)} footer={<><Btn onClick={() => setReaff(null)}>Annuler</Btn><Btn variant="primary" disabled={!vers.trim()} onClick={async () => { try { await api.post(`/alertes/${reaff.id}/reaffecter`, { vers }); setReaff(null); refresh(); } catch (e) { toast(errMsg(e), 'error'); } }}>Réaffecter</Btn></>}>
        <p className="text-body-md font-semibold">{reaff.titre}</p>
        <Field label="Nouveau responsable (identifiant)"><Input value={vers} onChange={(e) => setVers(e.target.value)} autoFocus /></Field>
      </Modal>}
    </>
  );
}
