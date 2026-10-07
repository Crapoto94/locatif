import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Lock } from 'lucide-react';
import { fileUrl } from '../lib/api';
import { useFetch, useDebounced } from '../lib/hooks';
import { useLabel, useRefList } from '../lib/refs';
import { bytes, dateFr, dateTimeFr } from '../lib/format';
import { Card, PageHeader, Tabs, DataTable, Pagination, Badge, Input, Select, Loading, ErrorBox } from '../components/ui';
import DocumentViewer from '../components/DocumentViewer';

const LIEN = { bien: '/biens', contrat: '/contrats', contractant: '/contractants' } as Record<string, string>;

export default function Documents() {
  const label = useLabel(); const types = useRefList('type_document');
  const [tab, setTab] = useState('tous'); const [q, setQ] = useState(''); const [type, setType] = useState(''); const [offset, setOffset] = useState(0); const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch<any>(tab === 'tous' ? '/documents' : null, { q: dq, type_code: type, offset, limit: 30 });
  const { data: obl } = useFetch<any[]>(tab === 'obligations' ? '/documents/obligations' : null);
  const today = new Date().toISOString().slice(0, 10);
  const [vue, setVue] = useState<number | null>(null);

  const liens = (d: any) => (d.liens || []).map((l: any, i: number) => LIEN[l.objet_type] ? <Link key={i} className="text-secondary hover:underline mr-2" to={`${LIEN[l.objet_type]}/${l.objet_id}`}>{l.objet_type} {l.objet_id}</Link> : null);
  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'Documents']} title="Centre documentaire" />
      <Tabs tabs={[{ id: 'tous', label: 'Tous les documents' }, { id: 'obligations', label: 'Obligations & échéances' }]} active={tab} onChange={setTab} />
      {tab === 'tous' && (
        <Card>
          <div className="flex flex-wrap gap-space-sm mb-space-md">
            <Input className="flex-1 min-w-[240px]" placeholder="Nom du document…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
            <Select className="w-56" value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}><option value="">Tous les types</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select>
          </div>
          {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
            <>
              <DataTable rows={data?.rows || []} cols={[
                { key: 'n', label: 'Document', render: (d: any) => <div className="flex items-center gap-2">{d.verrouille && <Lock size={14} className="text-error" />}{d.verrouille ? <span className="font-semibold text-primary">Pièce sensible (accès restreint)</span> : <button className="font-semibold text-primary hover:underline text-left" onClick={() => setVue(d.id)}>{d.nom}</button>}{d.sensible && <Badge tone="error">Sensible</Badge>}{d.en_ged && <Badge tone="info">GED</Badge>}</div> },
                { key: 't', label: 'Type', render: (d: any) => label('type_document', d.type_code) },
                { key: 'l', label: 'Rattaché à', render: liens },
                { key: 'v', label: 'Version', render: (d: any) => `v${d.version}` }, { key: 's', label: 'Taille', render: (d: any) => bytes(d.taille) },
                { key: 'u', label: 'Mis à jour', render: (d: any) => dateTimeFr(d.updated_at) },
                { key: 'a', label: '', render: (d: any) => !d.verrouille && <a href={fileUrl(`/documents/${d.id}/download`)} className="p-1 rounded hover:bg-surface-container-high text-secondary inline-block" title="Télécharger"><Download size={16} /></a> },
              ]} />
              <Pagination total={data?.total || 0} limit={30} offset={offset} onChange={setOffset} />
            </>
          )}
        </Card>
      )}
      {tab === 'obligations' && (
        <Card>
          <p className="text-body-md text-on-surface-variant mb-space-md">Documents avec une date d'expiration ou d'échéance (attestations d'assurance, pièces périodiques). Une alerte est générée dans les trois mois.</p>
          {!obl ? <Loading /> : <DataTable rows={obl} empty="Aucune obligation documentaire." cols={[
            { key: 'n', label: 'Document', render: (d: any) => <strong>{d.nom}</strong> }, { key: 't', label: 'Type', render: (d: any) => label('type_document', d.type_code) },
            { key: 'e', label: 'Échéance', render: (d: any) => { const e = d.date_expiration || d.date_attendue; return <Badge tone={e < today ? 'error' : 'warn'}>{dateFr(e)}{e < today ? ' — expiré' : ''}</Badge>; } },
            { key: 'l', label: 'Rattaché à', render: liens },
          ]} />}
        </Card>
      )}
      {vue && <DocumentViewer documentId={vue} onClose={() => setVue(null)} />}
    </>
  );
}
