import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useLabel, useRefList } from '../lib/refs';
import { dateFr, eur, num } from '../lib/format';
import { Card, PageHeader, Btn, Select, Loading, ErrorBox, Notice, toast } from '../components/ui';

// Centre d'Ivry-sur-Seine, zoom quartier. Fond de carte modifiable au build : VITE_TILE_URL (ex. serveur de tuiles interne).
const IVRY: [number, number] = [48.8137, 2.3850];
const TILES = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type Cat = 'occupe' | 'fin_proche' | 'vacant' | 'indisponible';
const COULEURS: Record<Cat, { fill: string; label: string }> = {
  occupe: { fill: '#0051d5', label: 'Occupé' },
  fin_proche: { fill: '#ba1a1a', label: 'Occupé — contrat se terminant sous 3 mois' },
  vacant: { fill: '#e07b00', label: 'Vacant' },
  indisponible: { fill: '#757681', label: 'Indisponible' },
};

const categorie = (b: any, dans3Mois: string): Cat => {
  if (b.disponibilite === 'indisponible') return 'indisponible';
  if (b.contrat_id) return b.date_fin && b.date_fin <= dans3Mois ? 'fin_proche' : 'occupe';
  return 'vacant';
};

export default function Cartographie() {
  const nav = useNavigate(); const { can } = useAuth(); const label = useLabel(); const types = useRefList('type_bien');
  const { data, loading, error, reload } = useFetch<any>('/biens/carte');
  const [type, setType] = useState(''); const [cat, setCat] = useState(''); const [busy, setBusy] = useState(false);
  const dans3Mois = useMemo(() => new Date(Date.now() + 92 * 86400000).toISOString().slice(0, 10), []);

  const biens = useMemo(() => (data?.biens || []).map((b: any) => ({ ...b, cat: categorie(b, dans3Mois) }))
    .filter((b: any) => (!type || b.type_code === type) && (!cat || b.cat === cat)), [data, type, cat, dans3Mois]);
  const compte = useMemo(() => { const c: Record<string, number> = {}; (data?.biens || []).forEach((b: any) => { const k = categorie(b, dans3Mois); c[k] = (c[k] || 0) + 1; }); return c; }, [data, dans3Mois]);

  const geocoder = async () => {
    setBusy(true);
    try { const r = await api.post('/biens/geocoder', {}); toast(`${r.data.localises} bien(s) positionné(s), ${r.data.non_trouves} adresse(s) introuvable(s)`); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader crumbs={['Pilotage & contrôle', 'Cartographie']} title="Cartographie du patrimoine locatif"
        actions={can('biens.write') && data?.non_localises > 0 && <Btn icon={<MapPin size={16} />} disabled={busy} onClick={geocoder}>{busy ? 'Géolocalisation…' : `Positionner les ${data.non_localises} bien(s) sans coordonnées`}</Btn>} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-space-lg">
          <Card className="xl:col-span-3 !p-0 overflow-hidden">
            <MapContainer center={IVRY} zoom={14} scrollWheelZoom style={{ height: 'calc(100vh - 210px)', minHeight: 460 }}>
              <TileLayer url={TILES} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19} />
              {biens.map((b: any) => (
                <CircleMarker key={b.id} center={[b.latitude, b.longitude]} radius={9}
                  pathOptions={{ color: '#ffffff', weight: 2, fillColor: COULEURS[b.cat as Cat].fill, fillOpacity: 0.95 }}
                  eventHandlers={{ click: () => nav(`/biens/${b.id}`) }}>
                  <Tooltip direction="top" offset={[0, -8]} sticky>
                    <div style={{ minWidth: 190 }}>
                      <strong>{b.designation}</strong>
                      <div style={{ fontSize: 11, color: '#444650' }}>{[b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ')}</div>
                      <div style={{ marginTop: 4 }}>{label('type_bien', b.type_code)}{b.surface ? ` • ${num(b.surface, 0)} m²` : ''}</div>
                      <div style={{ color: COULEURS[b.cat as Cat].fill, fontWeight: 600 }}>{COULEURS[b.cat as Cat].label}</div>
                      {b.contrat_id && <div>{b.occupant || '—'} • {b.contrat_numero}<br />Loyer {eur(b.loyer)}{b.date_fin ? ` • fin ${dateFr(b.date_fin)}` : ''}</div>}
                      <div style={{ marginTop: 4, fontSize: 11, color: '#0051d5' }}>Cliquer pour ouvrir la fiche</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </Card>
          <div className="flex flex-col gap-space-md">
            <Card>
              <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold mb-space-sm">Filtres</div>
              <div className="flex flex-col gap-space-sm">
                <Select value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous les types de bien</option>{types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}</Select>
                <Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes les situations</option>{(Object.keys(COULEURS) as Cat[]).map((k) => <option key={k} value={k}>{COULEURS[k].label}</option>)}</Select>
              </div>
            </Card>
            <Card>
              <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold mb-space-sm">Légende</div>
              {(Object.keys(COULEURS) as Cat[]).map((k) => (
                <button key={k} onClick={() => setCat(cat === k ? '' : k)} className={`w-full flex items-center justify-between gap-2 py-1.5 px-1 rounded text-left hover:bg-surface-container-low ${cat === k ? 'bg-surface-container-low' : ''}`}>
                  <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ background: COULEURS[k].fill }} />{COULEURS[k].label}</span>
                  <strong className="tabular-nums">{compte[k] || 0}</strong>
                </button>
              ))}
              <div className="mt-space-sm text-body-sm text-on-surface-variant">{biens.length} bien(s) affiché(s) sur {data?.localises} positionné(s).</div>
            </Card>
            {data?.non_localises > 0 && <Notice tone="warn">{data.non_localises} bien(s) sans coordonnées (adresse absente ou introuvable) ne figurent pas sur la carte.</Notice>}
          </div>
        </div>
      )}
    </>
  );
}
