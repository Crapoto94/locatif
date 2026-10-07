import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useRefs } from '../lib/refs';
import { Card, PageHeader, DataTable, Btn, Badge, Input, Field, Modal, Notice, Loading, toast, SectionTitle } from '../components/ui';

export default function Referentiels() {
  const { can } = useAuth(); const w = can('referentiels.write'); const { reload: reloadGlobal } = useRefs();
  const { data: doms } = useFetch<any[]>('/referentiels/domaines');
  const [dom, setDom] = useState('type_contrat');
  const { data, loading, reload } = useFetch<any[]>(`/referentiels/${dom}`);
  const [edit, setEdit] = useState<any | null>(null);
  const refresh = () => { reload(); reloadGlobal(); };
  const save = async () => {
    try { if (edit.id) await api.put(`/referentiels/${dom}/${edit.id}`, edit); else await api.post(`/referentiels/${dom}`, edit); setEdit(null); refresh(); toast('Référentiel mis à jour'); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const bascule = async (r: any) => { try { await api.put(`/referentiels/${dom}/${r.id}`, { actif: !r.actif }); refresh(); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <>
      <PageHeader crumbs={['Configuration', 'Référentiels']} title="Référentiels métier" />
      <Notice>Valeurs initiales déduites d'ASTECH et du cadrage : <strong>conventions de conception</strong> à valider par AFLC. Une valeur déjà utilisée ne se supprime pas, elle se <strong>désactive</strong>. Les référentiels financiers restent maîtrisés par le système financier.</Notice>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-space-lg mt-space-md">
        <Card className="h-fit">
          {!doms ? <Loading /> : doms.map((d) => (
            <button key={d.domaine} onClick={() => setDom(d.domaine)} className={`w-full text-left px-space-sm py-2 rounded-lg flex justify-between items-center ${dom === d.domaine ? 'bg-primary-container text-on-primary font-semibold' : 'hover:bg-surface-container-low'}`}>
              <span>{d.libelle}</span><span className="text-label-sm opacity-70">{d.actifs}</span>
            </button>
          ))}
        </Card>
        <Card className="lg:col-span-3">
          <SectionTitle title={doms?.find((d) => d.domaine === dom)?.libelle || dom} action={w && <Btn size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ code: '', libelle: '' })}>Ajouter une valeur</Btn>} />
          {loading && !data ? <Loading /> : <DataTable rows={data || []} cols={[
            { key: 'c', label: 'Code', render: (r: any) => <code className="text-body-sm">{r.code}</code> },
            { key: 'l', label: 'Libellé', render: (r: any) => <strong className={r.actif ? '' : 'line-through text-outline'}>{r.libelle}</strong> },
            { key: 'o', label: 'Origine', render: (r: any) => <Badge tone={r.origine === 'astech' ? 'info' : r.origine === 'seed' ? 'muted' : 'neutral'}>{r.origine === 'seed' ? 'initial' : r.origine}</Badge> },
            { key: 'u', label: 'Utilisations', align: 'right', render: (r: any) => r.utilisations },
            { key: 'a', label: 'Statut', render: (r: any) => <Badge tone={r.actif ? 'success' : 'muted'}>{r.actif ? 'Actif' : 'Désactivé'}</Badge> },
            { key: 'x', label: '', render: (r: any) => w && <div className="flex gap-1"><Btn size="sm" variant="ghost" onClick={() => setEdit({ ...r })}>Modifier</Btn><Btn size="sm" variant="ghost" onClick={() => bascule(r)}>{r.actif ? 'Désactiver' : 'Réactiver'}</Btn></div> },
          ]} />}
        </Card>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Modifier la valeur' : 'Nouvelle valeur'} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Annuler</Btn><Btn variant="primary" disabled={!edit.libelle || (!edit.id && !edit.code)} onClick={save}>Enregistrer</Btn></>}>
          <Field label="Code" hint="Lettres, chiffres et _ — non modifiable ensuite"><Input value={edit.code} disabled={Boolean(edit.id)} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label="Libellé"><Input value={edit.libelle} onChange={(e) => setEdit({ ...edit, libelle: e.target.value })} /></Field>
          <Field label="Ordre d'affichage"><Input type="number" value={edit.ordre ?? ''} onChange={(e) => setEdit({ ...edit, ordre: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
        </Modal>
      )}
    </>
  );
}
