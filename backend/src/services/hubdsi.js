// Appels à l'API métier Hub DSI (clé dsk_, scope « ville ») — référentiels Ville en lecture seule.
const axios = require('axios');
const https = require('https');
const { config } = require('../config');

const configured = () => Boolean(config.hub.url && config.hub.key);

const http = axios.create({
  baseURL: (config.hub.url || '').replace(/\/$/, ''),
  timeout: 15000,
  httpsAgent: new https.Agent({ rejectUnauthorized: !config.allowSelfSigned }),
});

// Petit cache mémoire : ces référentiels changent rarement.
const cache = new Map();
async function get(path, ttlMs = 10 * 60 * 1000) {
  if (!configured()) return [];
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const { data } = await http.get(path, { headers: { 'X-API-Key': config.hub.key } });
  cache.set(path, { at: Date.now(), data });
  return data;
}

const safe = (fn) => async () => { try { return await fn(); } catch (e) { console.warn('[HUB]', e.message); return []; } };

module.exports = {
  configured,
  sites: safe(() => get('/api/ville/sites')),
  directionsServices: safe(() => get('/api/directions-services')),
  villeConfig: safe(() => get('/api/ville/config')),
  status: async () => {
    if (!configured()) return { ok: false, detail: 'HUBDSI_API_URL / HUBDSI_API_KEY absents' };
    try { await http.get('/api/ville/config', { headers: { 'X-API-Key': config.hub.key } }); return { ok: true }; }
    catch (e) { return { ok: false, detail: e.response?.status ? `HTTP ${e.response.status}` : e.message }; }
  },
};
