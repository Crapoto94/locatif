// Géocodage des biens à partir de leur adresse (API Géoplateforme / Base Adresse Nationale, sans clé).
// Une position saisie à la main (geoloc_source = 'manuel') n'est jamais écrasée. Un résultat peu fiable est refusé plutôt que deviné.
const axios = require('axios');
const { db, t } = require('../../db');
const audit = require('../../services/audit');

const BASE = (process.env.GEOCODAGE_API_URL || 'https://data.geopf.fr/geocodage').replace(/\/$/, '');
const SCORE_MIN = parseFloat(process.env.GEOCODAGE_SCORE_MIN || '0.5');
const COMMUNE = (process.env.GEOCODAGE_CODE_INSEE || '94041'); // Ivry-sur-Seine : évite d'attribuer une rue homonyme d'une autre commune
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocoder(adresse, codePostal, ville) {
  const q = [adresse, codePostal, ville].filter(Boolean).join(' ');
  const { data } = await axios.get(`${BASE}/search`, { params: { q, limit: 1, citycode: COMMUNE }, timeout: 15000 });
  const f = data.features?.[0];
  if (!f || f.properties.score < SCORE_MIN) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, score: f.properties.score, label: f.properties.label };
}

// Géocode les biens avec adresse et sans position (ou tous avec `tous`, hors saisies manuelles).
async function geocoderBiens(user, { tous = false } = {}) {
  const biens = await db.all(
    `SELECT id, adresse, code_postal, ville FROM ${t('biens')} WHERE actif AND adresse IS NOT NULL AND COALESCE(geoloc_source,'') <> 'manuel' ${tous ? '' : 'AND latitude IS NULL'} ORDER BY id`);
  const stats = { traites: biens.length, localises: 0, non_trouves: 0, erreurs: 0 };
  for (const b of biens) {
    try {
      const r = await geocoder(b.adresse, b.code_postal, b.ville);
      if (r) {
        await db.run(`UPDATE ${t('biens')} SET latitude = $2, longitude = $3, geoloc_source = 'ban', geoloc_score = $4, geoloc_label = $5 WHERE id = $1`, [b.id, r.lat, r.lon, r.score, r.label]);
        stats.localises++;
      } else stats.non_trouves++;
    } catch { stats.erreurs++; }
    await pause(120);
  }
  await audit.log(user, 'bien.geocodage', 'bien', 'lot', { details: stats });
  return stats;
}

module.exports = { geocoderBiens, geocoder };
