import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, ChevronLeft, ChevronRight, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ---------- Cartes et en-têtes ----------
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`bg-surface-container-lowest rounded-lg shadow-sm p-space-md ${className}`}>{children}</div>
);

export const SectionTitle = ({ icon, title, action, sub }: { icon?: ReactNode; title: string; action?: ReactNode; sub?: string }) => (
  <div className="flex items-start justify-between gap-space-sm mb-space-sm">
    <div className="flex items-start gap-space-xs min-w-0">
      {icon && <span className="text-primary mt-0.5">{icon}</span>}
      <div className="min-w-0">
        <h2 className="text-headline-sm font-bold text-primary">{title}</h2>
        {sub && <p className="text-body-sm text-on-surface-variant">{sub}</p>}
      </div>
    </div>
    {action}
  </div>
);

export function PageHeader({ crumbs, title, actions, children }: { crumbs?: string[]; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-space-lg flex flex-col lg:flex-row lg:items-end lg:justify-between gap-space-md">
      <div className="flex flex-col gap-0.5 min-w-0">
        {crumbs && (
          <div className="flex items-center gap-space-xs text-on-surface-variant text-body-sm flex-wrap">
            {crumbs.map((c, i) => (
              <span key={i} className={i === crumbs.length - 1 ? 'font-semibold text-primary' : ''}>{i > 0 && <span className="text-outline-variant mr-space-xs">/</span>}{c}</span>
            ))}
          </div>
        )}
        <h1 className="text-headline-lg text-primary tracking-tight">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-sm">{actions}</div>}
    </div>
  );
}

export const Kpi = ({ label, value, unit, sub, tone = 'primary', icon }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'primary' | 'error' | 'secondary'; icon?: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">{label}</span>
      {icon && <span className={tone === 'error' ? 'text-error' : tone === 'secondary' ? 'text-secondary' : 'text-primary'}>{icon}</span>}
    </div>
    <div className="flex items-baseline gap-2">
      <span className={`text-headline-lg font-bold tabular-nums ${tone === 'error' ? 'text-error' : 'text-primary'}`}>{value}</span>
      {unit && <span className="text-label-md text-on-surface-variant">{unit}</span>}
    </div>
    {sub && <div className="text-body-sm text-on-surface-variant flex items-center gap-2 pt-1 flex-wrap">{sub}</div>}
  </div>
);

// ---------- Badges ----------
const TONES = {
  neutral: 'bg-surface-container-high text-primary', info: 'bg-secondary-fixed text-on-secondary-fixed', error: 'bg-error-container text-on-error-container',
  muted: 'bg-surface-container-highest text-on-surface-variant', success: 'bg-[#d6f0dd] text-[#0b5a2a]', warn: 'bg-[#ffe9c2] text-[#6b4300]',
};
export type Tone = keyof typeof TONES;
export const Badge = ({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) => (
  <span className={`px-2 py-0.5 rounded text-label-sm font-semibold whitespace-nowrap inline-block ${TONES[tone]} ${className}`}>{children}</span>
);

export const statutTone = (s?: string | null): Tone => (s === 'en_cours' ? 'info' : s === 'clos' || s === 'resilie' ? 'muted' : s === 'divers' ? 'warn' : 'neutral');

// ---------- Boutons / champs ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: ReactNode };
export function Btn({ variant = 'secondary', size = 'md', icon, children, className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-on-primary hover:bg-primary-container shadow-sm', secondary: 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
    ghost: 'bg-transparent text-secondary hover:bg-surface-container-low', danger: 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error',
  }[variant];
  return (
    <button {...p} className={`${size === 'sm' ? 'h-8 px-space-sm' : 'h-9 px-space-md'} rounded text-label-md font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`}>
      {icon}{children}
    </button>
  );
}

export const LinkBtn = ({ to, children, icon, primary }: { to: string; children: ReactNode; icon?: ReactNode; primary?: boolean }) => (
  <Link to={to} className={`h-9 px-space-md rounded text-label-md font-medium inline-flex items-center gap-1.5 transition-colors ${primary ? 'bg-primary text-on-primary hover:bg-primary-container shadow-sm' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'}`}>{icon}{children}</Link>
);

const inputCls = 'w-full h-9 px-space-sm rounded bg-surface-container-low text-on-surface text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:bg-surface-container-lowest';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className || ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className || ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${inputCls} h-auto py-2 ${p.className || ''}`} />;

export const Field = ({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) => (
  <label className={`flex flex-col gap-1 ${className}`}>
    <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">{label}</span>
    {children}
    {hint && <span className="text-body-sm text-outline">{hint}</span>}
  </label>
);

// ---------- États ----------
export const Loading = ({ label = 'Chargement…' }: { label?: string }) => (
  <div className="flex items-center gap-2 text-on-surface-variant text-body-md py-space-lg justify-center"><Loader2 className="animate-spin" size={18} />{label}</div>
);
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="rounded-lg bg-error-container text-on-error-container p-space-md text-body-md flex items-center justify-between gap-space-sm">
    <span className="flex items-center gap-2"><AlertTriangle size={16} />{message}</span>{onRetry && <Btn size="sm" onClick={onRetry}>Réessayer</Btn>}
  </div>
);
export const Empty = ({ children = 'Aucun résultat' }: { children?: ReactNode }) => <div className="text-center text-on-surface-variant text-body-md py-space-xl">{children}</div>;

export function Notice({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' | 'success'; icon?: ReactNode }) {
  const c = { info: 'bg-surface-container-high', warn: 'bg-[#fff4dc]', error: 'bg-error-container', success: 'bg-[#e1f4e7]' }[tone];
  const I = tone === 'error' || tone === 'warn' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  return <div className={`${c} rounded-lg p-space-md text-body-sm text-on-surface flex items-start gap-space-sm`}><span className="mt-0.5 text-secondary">{icon || <I size={16} />}</span><div className="min-w-0">{children}</div></div>;
}

// ---------- Tableau dense ----------
export interface Col<T> { key: string; label: string; render?: (row: T) => ReactNode; align?: 'right' | 'left'; sort?: string; className?: string }

export function DataTable<T extends { id?: number | string }>({ cols, rows, onSort, sort, dir, rowClass, empty }: {
  cols: Col<T>[]; rows: T[]; onSort?: (k: string) => void; sort?: string; dir?: string; rowClass?: (r: T) => string; empty?: ReactNode;
}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-md border-collapse">
        <thead>
          <tr className="bg-surface-container-high text-on-surface-variant text-label-sm uppercase tracking-wider">
            {cols.map((c) => (
              <th key={c.key} className={`py-2.5 px-space-md ${c.align === 'right' ? 'text-right' : ''} ${c.sort && onSort ? 'cursor-pointer select-none hover:text-primary' : ''}`}
                onClick={() => c.sort && onSort?.(c.sort)}>
                {c.label}{c.sort && sort === c.sort ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={`hover:bg-surface-container-low transition-colors border-b border-surface-container-low ${rowClass?.(r) || ''}`}>
              {cols.map((c) => (
                <td key={c.key} className={`py-2 px-space-md align-top ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return <div className="text-body-sm text-on-surface-variant pt-space-xs">{total} résultat{total > 1 ? 's' : ''}</div>;
  const page = Math.floor(offset / limit) + 1; const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between text-body-sm text-on-surface-variant pt-space-sm">
      <span>{offset + 1}–{Math.min(offset + limit, total)} sur {total}</span>
      <div className="flex items-center gap-1">
        <Btn size="sm" disabled={page <= 1} onClick={() => onChange(offset - limit)} icon={<ChevronLeft size={14} />} />
        <span className="px-2">Page {page} / {pages}</span>
        <Btn size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)} icon={<ChevronRight size={14} />} />
      </div>
    </div>
  );
}

// ---------- Onglets ----------
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; badge?: number | string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto mb-space-md">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-space-md py-2 rounded-lg text-body-md whitespace-nowrap flex items-center gap-2 transition-colors ${active === t.id ? 'bg-primary-container text-on-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          {t.label}{t.badge !== undefined && <span className={`text-label-sm px-1.5 rounded-full ${active === t.id ? 'bg-on-primary/20' : 'bg-surface-container-highest'}`}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Fenêtre modale ----------
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-primary/40 flex items-start justify-center p-space-md overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-surface-container-lowest rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-space-xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container-low rounded-t-xl">
          <h3 className="text-headline-sm text-primary font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-container-high" aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="p-space-lg flex flex-col gap-space-md">{children}</div>
        {footer && <div className="px-space-lg py-space-md flex justify-end gap-space-sm bg-surface-container-low rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

// Fenêtre de saisie d'un motif (corrections, retraits, clôtures…) — le motif est conservé dans l'audit.
export function MotifModal({ title, label = 'Motif', confirm = 'Confirmer', required = true, onCancel, onConfirm, children }: {
  title: string; label?: string; confirm?: string; required?: boolean; onCancel: () => void; onConfirm: (motif: string) => Promise<void> | void; children?: ReactNode;
}) {
  const [motif, setMotif] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onCancel} footer={<>
      <Btn onClick={onCancel}>Annuler</Btn>
      <Btn variant="primary" disabled={busy || (required && !motif.trim())} onClick={async () => { setBusy(true); try { await onConfirm(motif.trim()); } finally { setBusy(false); } }}>{confirm}</Btn>
    </>}>
      {children}
      <Field label={label}><Textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

// ---------- Notifications éphémères ----------
let pushToast: ((m: string, tone?: 'success' | 'error') => void) | null = null;
export const toast = (m: string, tone: 'success' | 'error' = 'success') => pushToast?.(m, tone);
export function Toaster() {
  const [items, setItems] = useState<{ id: number; m: string; tone: string }[]>([]);
  useEffect(() => {
    pushToast = (m, tone = 'success') => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, m, tone }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
    };
    return () => { pushToast = null; };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2" aria-live="polite">
      {items.map((i) => <div key={i.id} className={`px-space-md py-2 rounded-lg shadow-lg text-body-md max-w-sm ${i.tone === 'error' ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}>{i.m}</div>)}
    </div>
  );
}

export const Dl = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-space-lg gap-y-space-sm text-body-md">
    {items.map(([k, v]) => (
      <div key={k} className="flex flex-col"><dt className="text-label-sm text-on-surface-variant uppercase tracking-wider">{k}</dt><dd className="text-on-surface">{v ?? '—'}</dd></div>
    ))}
  </dl>
);
