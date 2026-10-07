// Appels à l'API centrale APM (https://api.ivry.local/api/v1) — clé X-API-KEY, jamais côté frontend.
const axios = require('axios');
const https = require('https');
const { config } = require('../config');

const http = axios.create({
  baseURL: `${config.apm.url.replace(/\/$/, '')}/api/v1`,
  timeout: 15000,
  httpsAgent: new https.Agent({ rejectUnauthorized: !config.allowSelfSigned }),
});

const headers = () => ({ 'X-API-KEY': config.apm.key });
const configured = () => Boolean(config.apm.key);

// Authentification d'un agent contre l'AD. 401 => identifiants invalides.
async function adAuthenticate(username, password) {
  if (!configured()) return { success: false, error: 'APM non configuré (APM_API_KEY)' };
  try {
    const { data } = await http.post('/ad/authenticate', { username, password }, { headers: headers() });
    return { success: data.success !== false, dn: data.dn };
  } catch (e) {
    return { success: false, status: e.response?.status, error: e.response?.data?.error || e.message };
  }
}

// Fiche d'un agent (mail, service…) — permission ad_read.
async function adUser(identifier) {
  if (!configured()) return null;
  try {
    const { data } = await http.get('/ad/user', { params: { identifier }, headers: headers() });
    return data?.user || data || null;
  } catch { return null; }
}

// Recherche d'agents — permission ad_search.
async function adSearch(q) {
  if (!configured()) return [];
  try {
    const { data } = await http.get('/ad/search', { params: { q }, headers: headers() });
    return Array.isArray(data) ? data : (data?.users || data?.results || []);
  } catch { return []; }
}

// Envoi d'un mail : le corps est habillé par le template institutionnel de l'APM.
async function mailSend({ to, subject, content, attachments }) {
  if (!configured()) return { status: 'skipped', reason: 'APM non configuré' };
  const { data } = await http.post('/mail/send', { to, subject, content, attachments, ...config.mailFooter }, { headers: headers() });
  return data;
}

async function status() {
  if (!configured()) return { ok: false, detail: 'APM_API_KEY absente' };
  try { await axios.get(`${config.apm.url.replace(/\/$/, '')}/api/status`, { timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: !config.allowSelfSigned }) }); return { ok: true }; }
  catch (e) { return { ok: false, detail: e.message }; }
}

module.exports = { adAuthenticate, adUser, adSearch, mailSend, status, configured };
