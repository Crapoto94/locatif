import { Link, useNavigate } from 'react-router-dom';
import { FileSignature, Banknote, Building2, BellRing, CalendarDays, Clock, Eye, FolderOpen, Plus, ArrowRight, ArrowLeftRight, CalendarX, TrendingUp, ShieldCheck, FileWarning } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel } from '../lib/refs';
import { eur, num, moisLabel, dateFr } from '../lib/format';
import { Card, Kpi, Loading, ErrorBox, PageHeader, LinkBtn, Badge, Notice, SectionTitle, statutTone } from '../components/ui';

const ICONES: Record<string, JSX.Element> = {
  fin_contrat: <CalendarX size={20} className="text-error" />, revision: <TrendingUp size={20} className="text-secondary" />, assurance_expirante: <ShieldCheck size={20} className="text-primary" />,
  document_manquant: <FileWarning size={20} className="text-on-surface-variant" />,
};
const TYPE_LABEL: Record<string, string> = { fin_contrat: 'Fin de contrat', revision: 'Révision', assurance_expirante: 'Assurance', document_manquant: 'Document', vacance_prolongee: 'Vacance', anomalie_echeancier: 'Échéancier', anomalie_technique: 'Technique', renouvellement: 'Renouvellement' };

export default function Dashboard() {
  const { data: d, loading, error, reload } = useFetch<any>('/dashboard');
  const { can } = useAuth();
  const nav = useNavigate();
  const label = useLabel();

  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return null;
  const camp = d.campagne;

  return (
    <>
      <Notice>
        <span className="text-label-sm text-secondary uppercase tracking-wider font-semibold mr-2">Cadrage des fonctions</span>
        Les montants affichés sont les montants locatifs <strong>attendus et échéancés</strong> — aucun encaissement n'est enregistré dans l'application. Suite financière : à spécifier avec la DSF / FILIEN-SEDIT.
      </Notice>
      <div className="h-space-md" />
      <PageHeader crumbs={['Gestion opérationnelle', 'Tableau de bord de synthèse']} title="Pilotage VibeLocatif"
        actions={<>{can('contrats.write') && <LinkBtn primary to="/contrats/nouveau" icon={<Plus size={16} />}>Nouveau contrat</LinkBtn>}</>}>
        <span className="inline-flex items-center gap-1 text-secondary text-label-sm"><span className="w-2 h-2 rounded-full bg-secondary animate-pulse" /> Données à jour — {moisLabel(d.periode)}</span>
      </PageHeader>

      <Card className="mb-space-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
          <Kpi label="Contrats actifs" value={num(d.contrats.actifs)} unit="titres" icon={<FileSignature size={20} />}
            sub={<><span>Bailleur : <strong className="text-primary tabular-nums">{d.contrats.bailleur}</strong></span><span className="text-outline-variant">•</span><span>Preneur : <strong className="text-secondary tabular-nums">{d.contrats.preneur}</strong></span></>} />
          <Kpi label={`Échéances ${moisLabel(d.periode)}`} value={num(d.echeances.total, 2)} unit="€" tone="primary" icon={<Banknote size={20} />}
            sub={<><span>Loyers : <strong className="text-on-surface tabular-nums">{eur(d.echeances.loyers, 0)}</strong></span><span className="text-outline-variant">•</span><span>Charges : <strong className="text-on-surface tabular-nums">{eur(d.echeances.charges, 0)}</strong></span></>} />
          <Kpi label="Biens vacants" value={num(d.biens.vacants)} unit="unités" icon={<Building2 size={20} />}
            sub={<><span>Taux de vacance :</span><strong className="text-primary tabular-nums">{num(d.biens.taux_vacance, 1)} %</strong></>} />
          <Kpi label="Alertes & campagne" value={num(d.alertes.actives)} unit="actives" tone="error" icon={<BellRing size={20} />}
            sub={camp ? <><span>Campagne : <strong className="text-primary tabular-nums">{num(camp.taux, 1)} %</strong></span><span className="text-outline-variant">•</span><span>{camp.statut}</span></> : <span>Campagne non préparée</span>} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <div className="lg:col-span-7">
          <Card>
            <div className="flex items-center justify-between pb-space-sm mb-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-error" />
                <h2 className="text-headline-md text-primary font-bold">À TRAITER — Actions immédiates requises</h2>
                {d.a_traiter.length > 0 && <Badge tone="error">{d.alertes.actives} alerte{d.alertes.actives > 1 ? 's' : ''}</Badge>}
              </div>
              <Link to="/alertes" className="text-label-sm text-secondary font-semibold hover:underline">Tout voir</Link>
            </div>
            {d.a_traiter.length === 0 && <div className="text-on-surface-variant text-body-md py-space-lg text-center">Aucune action en attente.</div>}
            {d.a_traiter.map((a: any) => (
              <div key={a.id} className="py-space-md flex flex-col gap-2 hover:bg-surface-container-low p-space-sm rounded-lg transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex items-start gap-space-sm min-w-0">
                    <span className="mt-0.5">{ICONES[a.type] || <BellRing size={20} className="text-primary" />}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><span className="text-headline-sm text-primary font-semibold">{a.titre}</span><Badge tone="neutral">{TYPE_LABEL[a.type] || a.type}</Badge></div>
                      <div className="text-body-sm text-on-surface-variant mt-0.5">
                        {a.objet_libelle && a.objet_type === 'contrat' && <>Contrat : <Link className="text-secondary font-semibold hover:underline tabular-nums" to={`/contrats/${a.objet_id}`}>{a.objet_libelle}</Link> • </>}
                        {a.date_cible && <>Échéance : <strong className="text-on-surface">{dateFr(a.date_cible)}</strong></>}
                      </div>
                    </div>
                  </div>
                  {a.objet_type && <button onClick={() => nav(`/${a.objet_type === 'bien' ? 'biens' : 'contrats'}/${a.objet_id}`)} className="h-8 px-space-sm rounded bg-surface-container-high text-on-surface text-label-md flex items-center gap-1 self-start sm:self-center hover:bg-surface-container-highest"><FolderOpen size={16} />Dossier</button>}
                </div>
                {a.message && <p className="text-body-sm text-on-surface-variant pl-8">{a.message}</p>}
              </div>
            ))}
          </Card>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <Card>
            <SectionTitle icon={<CalendarDays size={20} />} title="Échéancier trimestriel prévisionnel" action={<Link to="/echeancier" className="text-label-sm text-secondary font-semibold hover:underline">Vue complète</Link>} />
            <div className="grid grid-cols-3 gap-space-sm">
              {d.trimestre.map((m: any, i: number) => (
                <div key={m.periode} className={`p-space-sm rounded flex flex-col ${i === 0 ? 'bg-surface-container-low' : 'bg-surface-bright'}`}>
                  <span className={`text-label-sm font-bold uppercase ${i === 0 ? 'text-secondary' : 'text-on-surface-variant'}`}>{moisLabel(m.periode).slice(0, 8)}</span>
                  <span className="text-[10px] text-outline">M{i ? `+${i}` : ' (actuel)'}</span>
                  <span className="text-headline-sm text-primary font-bold tabular-nums mt-1">{eur(m.total, 0)}</span>
                  <span className="text-[10px] text-on-surface-variant tabular-nums">{m.nb} titres</span>
                </div>
              ))}
            </div>
            {camp && (
              <div className="mt-space-md">
                <div className="flex items-center justify-between text-label-sm"><span className="text-on-surface-variant">Taux de conformité de la campagne</span><span className="tabular-nums text-primary font-bold">{num(camp.taux, 1)} % ({camp.anomalies} anomalie{camp.anomalies > 1 ? 's' : ''})</span></div>
                <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden mt-1"><div className="bg-secondary h-full rounded-full" style={{ width: `${camp.taux}%` }} /></div>
              </div>
            )}
            <div className="mt-space-md">
              <div className="flex items-center gap-space-xs mb-1"><Clock size={18} className="text-primary" /><h3 className="text-headline-sm text-primary font-semibold">Mouvements & proratas du mois</h3></div>
              {d.mouvements.length === 0 && <div className="text-body-sm text-on-surface-variant py-2">Aucun prorata ce mois-ci.</div>}
              {d.mouvements.map((m: any) => (
                <div key={m.id} className="py-2 flex items-center justify-between text-body-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${m.mouvement === 'entree' ? 'bg-secondary' : m.mouvement === 'sortie' ? 'bg-outline' : 'bg-primary'}`} />
                      <span className="font-semibold text-primary truncate">{m.mouvement === 'entree' ? 'Entrée' : m.mouvement === 'sortie' ? 'Sortie' : 'Prorata'} : {m.contractants || m.numero}</span></div>
                    <span className="text-[11px] text-on-surface-variant pl-3.5 tabular-nums">{m.numero} • {m.prorata_jours} jours sur {m.prorata_base}</span>
                  </div>
                  <span className="font-bold text-primary tabular-nums flex-shrink-0">{eur(m.montant_total)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-space-lg">
        <SectionTitle icon={<ArrowLeftRight size={22} />} title="Navigation croisée — biens, contrats & contractants récents" sub="Accès rapide aux fiches actives"
          action={<Link to="/contrats" className="text-secondary font-semibold hover:underline flex items-center gap-1 text-body-sm">Registre des baux <ArrowRight size={16} /></Link>} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-md border-collapse">
            <thead><tr className="bg-surface-container-high text-on-surface-variant text-label-sm uppercase tracking-wider">
              {['Réf. contrat', "Type d'acte", 'Bien', 'Contractant', 'Loyer', 'Statut', ''].map((h, i) => <th key={i} className={`py-2.5 px-space-md ${i === 4 ? 'text-right' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.recents.map((c: any) => (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="py-2 px-space-md font-bold text-secondary tabular-nums"><Link className="hover:underline" to={`/contrats/${c.id}`}>{c.numero}</Link></td>
                  <td className="py-2 px-space-md text-body-sm">{label('type_contrat', c.type_code)}</td>
                  <td className="py-2 px-space-md font-semibold text-primary max-w-xs truncate">{c.bien || '—'}</td>
                  <td className="py-2 px-space-md">{c.contractant || '—'}</td>
                  <td className="py-2 px-space-md text-right font-bold text-primary tabular-nums">{eur(c.loyer)}</td>
                  <td className="py-2 px-space-md"><Badge tone={statutTone(c.statut_code)}>{label('statut_contrat', c.statut_code)}</Badge></td>
                  <td className="py-2 px-space-md text-right"><Link to={`/contrats/${c.id}`} className="p-1 rounded text-on-surface-variant hover:bg-surface-container-high inline-block" title="Consulter la fiche"><Eye size={18} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.recents.length === 0 && <div className="text-center text-on-surface-variant py-space-lg">Aucun contrat. Lancez la reprise ASTECH (Configuration → Reprise ASTECH) ou créez un contrat.</div>}
      </Card>
    </>
  );
}
