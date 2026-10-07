import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Save } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { setGeneral, useGeneral, logoUrl } from '../lib/general';
import { Card, PageHeader, Btn, Field, Input, Notice, SectionTitle, toast } from '../components/ui';

// Configuration générale : nom de la ville de référence et logo (menu, page de connexion).
export default function AdminGeneral() {
  const gen = useGeneral();
  const [nom, setNom] = useState(gen.ville_nom); const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setNom(gen.ville_nom), [gen.ville_nom]);

  const act = async (fn: () => Promise<{ data: any }>, ok: string) => {
    setBusy(true);
    try { setGeneral((await fn()).data); toast(ok); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const envoyer = (f?: File) => {
    if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    act(() => api.post('/admin/general/logo', fd), 'Logo mis à jour').finally(() => { if (fileRef.current) fileRef.current.value = ''; });
  };

  return (
    <>
      <PageHeader crumbs={['Configuration', 'Paramètres généraux']} title="Paramètres généraux" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <Card>
          <SectionTitle title="Ville de référence" />
          <Field label="Nom de la ville" hint="Affiché dans le menu et sur la page de connexion">
            <Input value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} />
          </Field>
          <div className="mt-space-md"><Btn variant="primary" icon={<Save size={14} />} disabled={busy || !nom.trim() || nom === gen.ville_nom}
            onClick={() => act(() => api.put('/admin/general', { ville_nom: nom }), 'Nom enregistré')}>Enregistrer</Btn></div>
        </Card>
        <Card>
          <SectionTitle title="Logo" />
          <div className="flex items-center gap-space-md mb-space-md">
            <img src={logoUrl(gen)} alt={gen.ville_nom} className="h-20 w-auto rounded shadow-sm bg-white" />
            <div className="text-body-sm text-on-surface-variant">{gen.logo ? 'Logo personnalisé' : 'Logo par défaut'}<br />PNG, JPEG, WebP ou GIF — 2 Mo max.</div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => envoyer(e.target.files?.[0])} />
          <div className="flex gap-space-sm">
            <Btn icon={<Upload size={14} />} disabled={busy} onClick={() => fileRef.current?.click()}>Téléverser un logo</Btn>
            {gen.logo && <Btn icon={<Trash2 size={14} />} disabled={busy} onClick={() => act(() => api.delete('/admin/general/logo'), 'Logo par défaut rétabli')}>Rétablir le logo par défaut</Btn>}
          </div>
          <Notice tone="info">Réservé aux administrateurs (droit « Gérer comptes et droits »).</Notice>
        </Card>
      </div>
    </>
  );
}
