import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, UserCog, CheckCircle2 } from 'lucide-react';
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
  const recalc = async () => { try { const r = await api.post('/alertes/recalculer', { notifier: true }); toast(`${r.data.creees} nouvelle(s) alerte(s)${r.data.notification?.envoyees ? ` — ${r.data.notification.envoyees} notifiée(s) par mail` : ''}`); refresh(); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'Alertes']} title="Centre des alertes" actions={w && <Btn icon={<RefreshCw size={16} />} onClick={recalc}>Recalculer & notifier</Btn>} />
      <Card className="mb-space-md">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setType(''); setOffset(0); }} className={`px-space-sm py-1 rounded text-label-md ${!type ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low hover:bg-surface-container-high'}`}>Toutes</button>
          {(cpt || []).map((c) => <button key={c.type} onClick={() => { setType(c.type); setOffset(0); }} className={`px-space-sm py-1 rounded text-label-md ${type === c.type ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low hover:bg-surface-container-high'}`}>{TYPES[c.type] || c.type} <span className="opacity-70">{c.n}</span></button>)}
        </div>
      </Card>
      <Tabs tabs={[{ id: 'active', label: 'À traiter' }, { id: 'traitee', label: 'Traitées' }]} active={statut} onChange={(s) => { setStatut(s); setOffset(0); }} />
      <label className="flex items-center gap-1.5 text-body-md mb-space-sm"><input type="checkbox" checked={moi} onChange={(e) => setMoi(e.target.checked)} />Seulement celles qui me sont assignées ({user?.username})</label>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <>
          {!data?.rows?.length ? <Card><Empty>{statut === 'active' ? 'Aucune alerte à traiter.' : 'Aucune alerte traitée.'}</Empty></Card> : (
            <div className="flex flex-col gap-space-sm">
              {data.rows.map((a: any) => (
                <Card key={a.id}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-space-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><span className="text-headline-sm text-primary font-semibold">{a.titre}</span><Badge tone="neutral">{TYPES[a.type] || a.type}</Badge>
                        {a.jours_restants !== null && a.statut === 'active' && <Badge tone={a.jours_restants < 0 ? 'error' : a.jours_restants < 30 ? 'warn' : 'info'}>{a.jours_restants < 0 ? `En retard de ${-a.jours_restants} j` : `J-${a.jours_restants}`}</Badge>}</div>
                      <div className="text-body-sm text-on-surface-variant mt-0.5">
                        {a.objet_type && a.objet_id && <Link className="text-secondary font-semibold hover:underline" to={`/${a.objet_type === 'bien' ? 'biens' : 'contrats'}/${a.objet_id}`}>{a.objet_libelle || `${a.objet_type} ${a.objet_id}`}</Link>}
                        {a.date_cible && <> • Échéance : <strong className="text-on-surface">{dateFr(a.date_cible)}</strong></>}
                        {a.assigne_a && <> • Assignée à <strong className="text-on-surface">{a.assigne_a}</strong></>}
                      </div>
                      {a.message && <p className="text-body-md mt-1">{a.message}</p>}
                      {a.statut === 'traitee' && <p className="text-body-sm text-on-surface-variant mt-1">Traitée par <strong>{a.traite_par}</strong> le {dateTimeFr(a.traite_le)} : {a.traitement}</p>}
                    </div>
                    {w && a.statut === 'active' && <div className="flex gap-space-xs flex-shrink-0"><Btn size="sm" icon={<UserCog size={14} />} onClick={() => { setReaff(a); setVers(''); }}>Réaffecter</Btn><Btn size="sm" variant="primary" icon={<CheckCircle2 size={14} />} onClick={() => setTraiter(a)}>Traiter</Btn></div>}
                  </div>
                </Card>
              ))}
            </div>
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
