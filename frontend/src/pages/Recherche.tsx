import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, Trash2 } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { Card, PageHeader, Input, Btn, Loading, SectionTitle, Empty, toast } from '../components/ui';

export default function Recherche() {
  const [sp, setSp] = useSearchParams(); const [q, setQ] = useState(sp.get('q') || '');
  useEffect(() => setQ(sp.get('q') || ''), [sp]);
  const { data, loading } = useFetch<any>(q.trim().length >= 2 ? '/recherche' : null, { q: q.trim(), limit: 15 });
  const { data: saved, reload } = useFetch<any[]>('/recherche/enregistrees');
  const total = data ? data.contrats.length + data.biens.length + data.contractants.length + data.echeances.length : 0;
  const save = async () => { const l = prompt('Nom de la recherche enregistrée', q); if (!l) return; try { await api.post('/recherche/enregistrees', { libelle: l, requete: q }); reload(); } catch (e) { toast(errMsg(e), 'error'); } };

  return (
    <>
      <PageHeader crumbs={['Recherche']} title="Recherche globale" />
      <Card className="mb-space-md">
        <form onSubmit={(e) => { e.preventDefault(); setSp({ q }); }} className="flex gap-space-sm">
          <Input autoFocus placeholder="Contrat, adresse du bien, nom du locataire, adresse du contractant, n° de quittance, tiers SEDIT…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Btn type="submit" variant="primary">Rechercher</Btn>
          {q.trim().length >= 2 && <Btn type="button" icon={<Bookmark size={15} />} onClick={save}>Enregistrer</Btn>}
        </form>
        {saved && saved.length > 0 && <div className="flex flex-wrap gap-2 mt-space-sm items-center"><span className="text-label-sm uppercase text-on-surface-variant">Mes recherches :</span>
          {saved.map((s) => <span key={s.id} className="inline-flex items-center gap-1 bg-surface-container-low rounded px-2 py-0.5 text-body-sm"><button className="hover:text-secondary" onClick={() => setSp({ q: s.requete })}>{s.libelle}</button><button className="text-outline hover:text-error" onClick={async () => { await api.delete(`/recherche/enregistrees/${s.id}`); reload(); }}><Trash2 size={12} /></button></span>)}</div>}
      </Card>
      {loading && <Loading />}
      {data && !loading && (total === 0 ? <Card><Empty>Aucun résultat pour « {data.q} ».</Empty></Card> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
          {data.contrats.length > 0 && <Card><SectionTitle title={`Contrats (${data.contrats.length})`} />{data.contrats.map((c: any) => <div key={c.id} className="py-1.5 border-b border-surface-container-low last:border-0"><Link className="font-bold text-secondary hover:underline tabular-nums" to={`/contrats/${c.id}`}>{c.numero}</Link><span className="text-body-sm text-on-surface-variant ml-2">{c.objet}</span></div>)}</Card>}
          {data.contractants.length > 0 && <Card><SectionTitle title={`Contractants (${data.contractants.length})`} />{data.contractants.map((c: any) => <div key={c.id} className="py-1.5 border-b border-surface-container-low last:border-0"><Link className="font-semibold text-primary hover:underline" to={`/contractants/${c.id}`}>{c.nom}{c.prenom ? ` ${c.prenom}` : ''}</Link><span className="text-body-sm text-on-surface-variant ml-2">{[c.adresse, c.ville].filter(Boolean).join(' ')}</span></div>)}</Card>}
          {data.biens.length > 0 && <Card><SectionTitle title={`Biens (${data.biens.length})`} />{data.biens.map((b: any) => <div key={b.id} className="py-1.5 border-b border-surface-container-low last:border-0"><Link className="font-semibold text-primary hover:underline" to={`/biens/${b.id}`}>{b.designation}</Link><span className="text-body-sm text-on-surface-variant ml-2">{[b.adresse, b.ville].filter(Boolean).join(' ')}</span></div>)}</Card>}
          {data.echeances.length > 0 && <Card><SectionTitle title={`Quittances (${data.echeances.length})`} />{data.echeances.map((e: any) => <div key={e.id} className="py-1.5 border-b border-surface-container-low last:border-0"><Link className="text-secondary hover:underline" to={`/contrats/${e.contrat_id}`}>{e.numero}</Link><span className="text-body-sm text-on-surface-variant ml-2">quittance {e.numero_quittance} — {e.libelle}</span></div>)}</Card>}
        </div>
      ))}
    </>
  );
}
