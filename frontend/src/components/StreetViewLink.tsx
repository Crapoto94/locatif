import { MapPin } from 'lucide-react';

// Épingle : ouvre Google Street View à l'emplacement du bien (nouvel onglet). Sans coordonnées, recherche Google Maps sur l'adresse.
// URL de base modifiable au build (VITE_STREETVIEW_URL) si un autre service est préféré ; {lat}, {lon} et {adresse} sont remplacés.
const MODELE = (import.meta.env.VITE_STREETVIEW_URL as string | undefined) || 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lon}';
const RECHERCHE = 'https://www.google.com/maps/search/?api=1&query={adresse}';

export function streetViewUrl(b: { latitude?: number | string | null; longitude?: number | string | null; adresse?: string | null; code_postal?: string | null; ville?: string | null }) {
  if (b.latitude != null && b.longitude != null && b.latitude !== '' && b.longitude !== '') {
    return MODELE.replace('{lat}', String(b.latitude)).replace('{lon}', String(b.longitude));
  }
  const adresse = [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ');
  return adresse ? RECHERCHE.replace('{adresse}', encodeURIComponent(adresse)) : null;
}

export default function StreetViewLink({ bien, size = 15 }: { bien: any; size?: number }) {
  const url = streetViewUrl(bien);
  if (!url) return null;
  const precis = bien.latitude != null && bien.longitude != null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      title={precis ? 'Voir dans Google Street View' : "Voir l'adresse sur Google Maps"}
      className="inline-flex items-center justify-center p-1 rounded text-error hover:bg-error-container align-middle flex-shrink-0">
      <MapPin size={size} />
    </a>
  );
}
