import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import VersionBadge from './VersionBadge';
import { Map as MapIcon, LayoutDashboard, Building2, Settings, Users, FileSignature, CalendarClock, ClipboardCheck, FolderOpen, Bell, BarChart3, ListChecks, ShieldCheck, Search, History, LogOut, TrendingUp, Calculator, FileText, ScrollText, HardDrive, DatabaseZap, FileOutput, User as UserIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { getRecents, type Recent } from '../lib/recents';
import { Toaster } from './ui';
import { useGeneral, logoUrl } from '../lib/general';

interface Item { to: string; label: string; icon: ReactNode; perm: string; badge?: boolean }
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Gestion opérationnelle', items: [
    { to: '/', label: 'Tableau de bord', icon: <LayoutDashboard size={18} />, perm: 'contrats.read' },
    { to: '/biens', label: 'Biens & Locaux', icon: <Building2 size={18} />, perm: 'biens.read' },
    { to: '/contractants', label: 'Contractants', icon: <Users size={18} />, perm: 'contractants.read' },
    { to: '/contrats', label: 'Contrats & Baux', icon: <FileSignature size={18} />, perm: 'contrats.read' },
    { to: '/cartographie', label: 'Cartographie', icon: <MapIcon size={18} />, perm: 'biens.read' },
  ] },
  { title: 'Finances & Quittancement', items: [
    { to: '/echeancier', label: 'Échéancier', icon: <CalendarClock size={18} />, perm: 'echeancier.read' },
    { to: '/campagne', label: 'Campagne mensuelle', icon: <ClipboardCheck size={18} />, perm: 'campagne.read' },
    { to: '/revisions', label: 'Indices & Révisions', icon: <TrendingUp size={18} />, perm: 'revisions.read' },
    { to: '/charges', label: 'Charges', icon: <Calculator size={18} />, perm: 'charges.read' },
  ] },
  { title: 'Pilotage & Contrôle', items: [
    { to: '/documents', label: 'Documents', icon: <FolderOpen size={18} />, perm: 'documents.read' },
    { to: '/generation', label: 'Génération', icon: <FileText size={18} />, perm: 'documents.read' },
    { to: '/alertes', label: 'Alertes', icon: <Bell size={18} />, perm: 'alertes.read', badge: true },
    { to: '/etats', label: 'États & Statistiques', icon: <BarChart3 size={18} />, perm: 'etats.read' },
    { to: '/audit', label: 'Historique & Audit', icon: <ScrollText size={18} />, perm: 'audit.read' },
  ] },
  { title: 'Configuration', items: [
    { to: '/admin/general', label: 'Paramètres généraux', icon: <Settings size={18} />, perm: 'admin.users' },
    { to: '/referentiels', label: 'Référentiels', icon: <ListChecks size={18} />, perm: 'referentiels.read' },
    { to: '/admin/droits', label: 'Comptes & droits', icon: <ShieldCheck size={18} />, perm: 'admin.users' },
    { to: '/admin/filien', label: 'Paramétrage FILIEN', icon: <FileOutput size={18} />, perm: 'admin.filien' },
    { to: '/admin/ged', label: 'Stockage / GED', icon: <HardDrive size={18} />, perm: 'admin.ged' },
    { to: '/admin/reprise', label: 'Reprise ASTECH', icon: <DatabaseZap size={18} />, perm: 'admin.reprise' },
  ] },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const nav = useNavigate(); const gen = useGeneral();
  const [q, setQ] = useState('');
  const [alertes, setAlertes] = useState(0);
  const [recents, setRecents] = useState<Recent[]>(getRecents());

  useEffect(() => {
    const on = () => setRecents(getRecents());
    window.addEventListener('locatif:recents', on);
    return () => window.removeEventListener('locatif:recents', on);
  }, []);
  useEffect(() => {
    if (!can('alertes.read')) return;
    const load = () => api.get('/alertes/compteurs').then((r) => setAlertes((r.data as { n: number }[]).reduce((s, x) => s + x.n, 0))).catch(() => {});
    load(); const t = setInterval(load, 120000); return () => clearInterval(t);
  }, [can]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('global-search')?.focus(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between select-none">
        <div className="flex flex-col min-h-0">
          <div className="h-14 px-space-md flex items-center gap-space-sm">
            <Link to="/" title={gen.ville_nom} className="flex-shrink-0"><img src={logoUrl(gen)} alt={gen.ville_nom} className="h-10 w-auto rounded shadow-sm bg-white" /></Link>
            <div className="flex flex-col min-w-0">
              <span className="text-headline-sm text-primary truncate leading-tight">VibeLocatif</span>
              <span className="text-label-sm text-on-surface-variant truncate uppercase tracking-wider">{gen.ville_nom}</span>
            </div>
          </div>
          <div className="px-space-md py-space-xs">
            <div className="bg-surface-container-high px-space-sm py-1 rounded-lg flex items-center justify-between">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Exercice budgétaire</span>
              <span className="tabular-nums text-primary font-bold">{new Date().getFullYear()}</span>
            </div>
          </div>
          <nav className="flex-1 px-space-sm py-space-xs space-y-0.5 overflow-y-auto">
            {GROUPS.map((g) => {
              const items = g.items.filter((i) => can(i.perm));
              if (!items.length) return null;
              return (
                <div key={g.title}>
                  <div className="px-space-sm pt-space-sm pb-0.5 text-label-sm font-bold text-on-surface uppercase tracking-wider">{g.title}</div>
                  {items.map((i) => (
                    <NavLink key={i.to} to={i.to} end={i.to === '/'}
                      className={({ isActive }) => `flex items-center justify-between px-space-sm py-2 rounded-lg transition-colors ${isActive ? 'bg-primary-container text-on-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}>
                      <span className="flex items-center gap-space-sm">{i.icon}<span>{i.label}</span></span>
                      {i.badge && alertes > 0 && <span className="bg-error text-on-error text-label-sm px-1.5 rounded-full">{alertes}</span>}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
        </div>
        <div className="p-space-sm">
          <div className="p-space-sm rounded-lg bg-surface-container-lowest shadow-sm flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Connexion sécurisée</span>
              <span className="inline-flex items-center gap-1 text-label-sm text-secondary"><span className="w-1.5 h-1.5 rounded-full bg-secondary" />{user?.source === 'local' ? 'Compte local' : 'AD'}</span>
            </div>
            <span className="text-body-sm text-on-surface font-semibold truncate">{user?.profils.join(' · ')}</span>
            <VersionBadge />
          </div>
        </div>
      </aside>

      <div className="pl-64 min-h-screen flex flex-col bg-background">
        <header className="fixed top-0 left-64 right-0 h-14 bg-surface-container-lowest/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 px-space-lg flex items-center justify-between gap-space-md">
          <form className="relative max-w-lg w-full" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) nav(`/recherche?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline" />
            <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un contrat, un locataire, une adresse, une référence…"
              className="w-full h-8 pl-8 pr-12 rounded-lg bg-surface-container-low text-body-sm placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary/30" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant">Ctrl K</span>
          </form>
          <div className="flex items-center gap-space-md flex-shrink-0">
            {recents.length > 0 && (
              <div className="hidden xl:flex items-center gap-space-xs text-on-surface-variant text-body-sm">
                <History size={14} className="text-outline" />
                <span className="text-label-sm uppercase tracking-wider">Récents :</span>
                {recents.slice(0, 3).map((r, i) => <span key={r.to} className="flex items-center gap-1">{i > 0 && <span className="text-outline-variant">•</span>}<Link to={r.to} className="hover:text-primary hover:underline max-w-[140px] truncate">{r.label}</Link></span>)}
              </div>
            )}
            <Link to="/alertes" className="relative p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high" title="Centre des alertes">
              <Bell size={20} />{alertes > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error" />}
            </Link>
            <div className="flex items-center gap-space-sm pl-space-sm">
              <div className="hidden lg:flex flex-col items-end text-right">
                <span className="text-headline-sm text-on-surface leading-tight">{user?.displayName || user?.username}</span>
                <span className="text-label-sm text-on-surface-variant">{user?.service || user?.profils.join(', ')}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary"><UserIcon size={16} /></div>
              <button onClick={logout} title="Se déconnecter" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high"><LogOut size={18} /></button>
            </div>
          </div>
        </header>
        <main className="flex-1 pt-14 w-full px-margin-desktop py-space-md"><div className="flex flex-col w-full pt-space-md"><Outlet /></div></main>
      </div>
      <Toaster />
    </div>
  );
}
