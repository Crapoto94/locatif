import { useEffect, useMemo, useState } from 'react';
import { X, Download, File as FileIcon, Clock, User, Lock } from 'lucide-react';
import { api, errMsg, fileUrl } from '../lib/api';
import { useLabel } from '../lib/refs';
import { bytes, dateTimeFr } from '../lib/format';

// Visionneuse de documents (même disposition que celle d'AppDSI) : versions à gauche, aperçu intégré à droite
// (PDF et images affichés dans la page, sans téléchargement) ; repli sur le téléchargement pour les autres formats.
type Kind = 'pdf' | 'image' | 'none';
const kindOf = (mime?: string | null, nom?: string | null): Kind => {
  const n = (nom || '').toLowerCase(); const m = (mime || '').toLowerCase();
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'image';
  return 'none';
};

export default function DocumentViewer({ documentId, onClose }: { documentId: number; onClose: () => void }) {
  const label = useLabel();
  const [doc, setDoc] = useState<any | null>(null); const [versions, setVersions] = useState<any[]>([]);
  const [active, setActive] = useState<number | null>(null); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [d, v] = await Promise.all([api.get(`/documents/${documentId}`), api.get(`/documents/${documentId}/versions`)]);
        if (annule) return;
        setDoc(d.data); setVersions(v.data); setActive(v.data[0]?.version ?? d.data.version);
      } catch (e) { if (!annule) setError(errMsg(e)); }
    })();
    return () => { annule = true; };
  }, [documentId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const kind = useMemo(() => kindOf(doc?.mime, doc?.nom), [doc]);
  const contenu = active ? fileUrl(`/documents/${documentId}/versions/${active}/content?mode=inline`) : '';
  const telecharger = active ? fileUrl(`/documents/${documentId}/versions/${active}/content`) : '';

  return (
    <div className="fixed inset-0 z-[80] bg-black/55 flex items-center justify-center p-5" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[95vw] max-w-[1200px] h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Visionneuse de document">
        <div className="px-4 py-3 border-b border-surface-container-high flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-headline-sm font-semibold text-on-surface truncate flex items-center gap-2">
              {doc?.sensible && <Lock size={14} className="text-error" />}{doc?.nom || 'Document'}
            </div>
            {doc && <div className="text-body-sm text-on-surface-variant">{label('type_document', doc.type_code)} • v{doc.version}{doc.commentaire ? ` • ${doc.commentaire}` : ''}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant" aria-label="Fermer"><X size={18} /></button>
        </div>

        {error ? <div className="p-10 text-center text-error">{error}</div> : !doc ? <div className="p-10 text-center text-on-surface-variant">Chargement…</div> : (
          <div className="flex flex-1 min-h-0">
            <aside className="w-[260px] border-r border-surface-container-high bg-surface-container-low flex flex-col flex-shrink-0">
              <div className="px-3 py-2.5 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant border-b border-surface-container-high">Versions</div>
              <div className="overflow-y-auto flex-1">
                {versions.map((v) => (
                  <button key={v.version} onClick={() => setActive(v.version)}
                    className={`w-full text-left px-3 py-2.5 border-b border-surface-container-low text-body-md ${v.version === active ? 'bg-secondary-fixed border-l-[3px] border-l-secondary' : 'hover:bg-surface-container'}`}>
                    <div className="flex items-baseline justify-between"><strong>v{v.version}</strong>{v.version === doc.version && <span className="bg-[#10b981] text-white text-[10px] px-1.5 rounded-full font-semibold">courante</span>}</div>
                    <div className="text-[11px] text-on-surface-variant mt-1 flex items-center gap-1"><Clock size={11} />{dateTimeFr(v.created_at)}</div>
                    {v.auteur && <div className="text-[11px] text-on-surface-variant flex items-center gap-1"><User size={11} />{v.auteur}</div>}
                    <div className="text-[11px] text-on-surface-variant">{bytes(v.taille)}</div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="flex-1 flex flex-col min-w-0">
              <div className="px-3.5 py-2.5 border-b border-surface-container-high flex items-center gap-2.5 bg-white">
                <div className="flex-1 min-w-0 truncate"><strong>{doc.nom}</strong></div>
                {active && <a href={telecharger} className="inline-flex items-center gap-1.5 text-body-md bg-secondary text-on-secondary px-3 py-1.5 rounded-md font-medium hover:opacity-90"><Download size={14} />Télécharger</a>}
              </div>
              <div className="flex-1 bg-[#f3f4f6] overflow-hidden flex">
                {contenu && kind === 'pdf' && <iframe src={contenu} title={doc.nom} className="w-full h-full border-0 bg-white" />}
                {contenu && kind === 'image' && <div className="w-full h-full overflow-auto flex items-center justify-center p-5"><img src={contenu} alt={doc.nom} className="max-w-full max-h-full object-contain" /></div>}
                {kind === 'none' && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-10 text-on-surface-variant">
                    <FileIcon size={64} className="text-outline" />
                    <div className="mt-3">Prévisualisation non disponible pour ce type de fichier.</div>
                    {active && <a href={telecharger} className="mt-4 inline-flex items-center gap-1.5 bg-secondary text-on-secondary px-3 py-2 rounded-md font-medium"><Download size={16} />Télécharger {doc.nom}</a>}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
