import { ExternalLink } from 'lucide-react';

// Numéro de tiers SEDIT cliquable : ouvre la fiche du tiers dans SEDIT (nouvel onglet). Sans identifiant technique, simple texte.
export default function SeditLink({ code, url }: { code?: string | null; url?: string | null }) {
  if (!code) return <span>—</span>;
  if (!url) return <span className="tabular-nums">{code}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir le tiers dans SEDIT" className="inline-flex items-center gap-1 text-secondary font-semibold hover:underline tabular-nums">
      {code}<ExternalLink size={12} />
    </a>
  );
}
