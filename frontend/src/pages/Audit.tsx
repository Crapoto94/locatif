import { useState } from 'react';
import { useFetch, useDebounced } from '../lib/hooks';
import { dateTimeFr } from '../lib/format';
import { Card, PageHeader, DataTable, Pagination, Input, Select, Badge, Loading, ErrorBox } from '../components/ui';

export default function Audit() {
  const [q, setQ] = useState(''); const [utilisateur, setUtilisateur] = useState(''); const [entite, setEntite] = useState('');
  const [du, setDu] = useState(''); const [au, setAu] = useState(''); const [offset, setOffset] = useState(0);
  const dq = useDebounced(q); const dus = useDebounced(utilisateur);
  const { data, loading, error, reload } = useFetch<any>('/audit', { q: dq, utilisateur: dus, entite, du, au, offset, limit: 50 });
  const reset = () => setOffset(0);
  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'Historique & audit']} title="Historique, traçabilité & audit" />
      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-space-sm mb-space-md">
          <Input className="lg:col-span-2" placeholder="Valeur, motif, champ…" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
          <Input placeholder="Utilisateur" value={utilisateur} onChange={(e) => { setUtilisateur(e.target.value); reset(); }} />
          <Select value={entite} onChange={(e) => { setEntite(e.target.value); reset(); }}><option value="">Tous les objets</option>{['contrat', 'bien', 'contractant', 'echeance', 'campagne', 'alerte', 'document', 'charge', 'user', 'profil', 'referentiel', 'indice', 'reprise', 'ged'].map((x) => <option key={x} value={x}>{x}</option>)}</Select>
          <div className="flex gap-1"><Input type="date" value={du} onChange={(e) => { setDu(e.target.value); reset(); }} /><Input type="date" value={au} onChange={(e) => { setAu(e.target.value); reset(); }} /></div>
        </div>
        {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <DataTable rows={data?.rows || []} cols={[
              { key: 'ts', label: 'Date / heure', render: (r: any) => <span className="tabular-nums whitespace-nowrap">{dateTimeFr(r.ts)}</span> },
              { key: 'u', label: 'Utilisateur', render: (r: any) => r.utilisateur || '—' },
              { key: 'e', label: 'Événement', render: (r: any) => <Badge tone="muted">{r.evenement}</Badge> },
              { key: 'o', label: 'Objet', render: (r: any) => `${r.entite} ${r.entite_id ?? ''}` },
              { key: 'c', label: 'Champ', render: (r: any) => r.champ || '—' },
              { key: 'a', label: 'Ancienne valeur', render: (r: any) => <span className="break-all">{r.ancienne_valeur ?? '—'}</span> },
              { key: 'n', label: 'Nouvelle valeur', render: (r: any) => <strong className="break-all">{r.nouvelle_valeur ?? '—'}</strong> },
              { key: 'm', label: 'Motif', render: (r: any) => r.motif || '—' },
            ]} />
            <Pagination total={data?.total || 0} limit={50} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}
