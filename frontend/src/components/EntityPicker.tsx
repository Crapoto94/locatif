import { useEffect, useState } from 'react';
import { X, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { Input } from './ui';

export interface PickItem { id: number; label: string; sub?: string; role?: string }

// Sélecteur à recherche instantanée (biens, contractants) avec liste des éléments choisis.
export default function EntityPicker({ kind, value, onChange, roles }: {
  kind: 'biens' | 'contractants'; value: PickItem[]; onChange: (v: PickItem[]) => void; roles?: { code: string; libelle: string }[];
}) {
  const [q, setQ] = useState(''); const dq = useDebounced(q, 250);
  const [res, setRes] = useState<PickItem[]>([]);
  useEffect(() => {
    if (dq.trim().length < 2) { setRes([]); return; }
    api.get(`/${kind}`, { params: { q: dq, limit: 8 } }).then((r) => setRes(r.data.rows.map((x: any) => ({
      id: x.id, label: kind === 'biens' ? x.designation : `${x.nom}${x.prenom ? ` ${x.prenom}` : ''}`,
      sub: kind === 'biens' ? [x.adresse, x.ville].filter(Boolean).join(' ') : [x.adresse, x.ville].filter(Boolean).join(' '),
    })))).catch(() => setRes([]));
  }, [dq, kind]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={15} className="absolute left-2.5 top-2.5 text-outline" />
        <Input className="pl-8" placeholder={kind === 'biens' ? 'Rechercher un bien (désignation, adresse)…' : 'Rechercher un contractant (nom, SIREN)…'} value={q} onChange={(e) => setQ(e.target.value)} />
        {res.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface-container-lowest rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {res.filter((r) => !value.some((v) => v.id === r.id)).map((r) => (
              <li key={r.id}><button type="button" className="w-full text-left px-space-sm py-2 hover:bg-surface-container-low text-body-md"
                onClick={() => { onChange([...value, { ...r, role: roles?.[0]?.code }]); setQ(''); setRes([]); }}>
                <div className="font-semibold text-primary">{r.label}</div>{r.sub && <div className="text-[11px] text-on-surface-variant">{r.sub}</div>}</button></li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((v, i) => (
            <li key={v.id} className="flex items-center justify-between gap-2 bg-surface-container-low rounded px-space-sm py-1.5">
              <span className="min-w-0 truncate"><span className="font-semibold text-primary">{v.label}</span>{v.sub && <span className="text-[11px] text-on-surface-variant ml-2">{v.sub}</span>}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                {roles && <select className="h-7 rounded bg-surface-container-lowest text-body-sm px-1" value={v.role} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{roles.map((r) => <option key={r.code} value={r.code}>{r.libelle}</option>)}</select>}
                <button type="button" onClick={() => onChange(value.filter((x) => x.id !== v.id))} className="text-on-surface-variant hover:text-error" aria-label="Retirer"><X size={15} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
