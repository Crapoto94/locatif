// Vérification des SIRET auprès de l'API publique « Recherche d'entreprises » (data.gouv, base Sirene) : sans clé, ~7 appels/s.
// URL paramétrable (SIRENE_API_URL) pour passer par un proxy de la Ville ou basculer vers l'API INSEE officielle.
const axios = require('axios');
const https = require('https');
const { config } = require('../../config');
const { db, t } = require('../../db');
const audit = require('../../services/audit');

const BASE = (process.env.SIRENE_API_URL || 'https://recherche-entreprises.api.gouv.fr').replace(/\/$/, '');
const http = axios.create({ baseURL: BASE, timeout: 15000, httpsAgent: new https.Agent({ rejectUnauthorized: !config.allowSelfSigned }) });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function interroger(siret, essai = 0) {
  try {
    const { data } = await http.get('/search', { params: { q: siret, per_page: 1 } });
    const e = (data.results || [])[0];
    if (!e) return { statut: 'introuvable' };
    const etab = (e.matching_etablissements || []).find((x) => x.siret === siret) || (e.siege?.siret === siret ? e.siege : null);
    // État de l'unité légale : l'entreprise peut rester active alors que l'établissement a fermé (déménagement, fermeture d'agence).
    const entreprise = { siren_etat: e.etat_administratif === 'A' ? 'active' : 'cessee', siren_cessation_le: e.date_fermeture || null, etablissements_ouverts: e.nombre_etablissements_ouverts ?? null,
      siege_siret: e.siege?.siret || null, siege_adresse: e.siege?.adresse || null };
    if (!etab) return { statut: 'introuvable', denomination: e.nom_complet, ...entreprise };
    return { statut: etab.etat_administratif === 'A' ? 'actif' : 'ferme', denomination: e.nom_complet, fermeture: etab.date_fermeture || null, ...entreprise };
  } catch (err) {
    if (err.response?.status === 429 && essai < 3) { await pause(1500 * (essai + 1)); return interroger(siret, essai + 1); }
    return { statut: 'erreur', note: err.response?.status ? `HTTP ${err.response.status}` : err.message };
  }
}

// Vérifie les contractants ayant un SIRET (tous, ou la liste d'identifiants donnée) et enregistre le résultat.
async function verifier(user, ids) {
  const params = []; let where = "siret ~ '^[0-9]{14}$'";
  if (ids?.length) { params.push(ids); where += ' AND id = ANY($1)'; }
  const cibles = await db.all(`SELECT id, nom, siret, siret_statut FROM ${t('contractants')} WHERE ${where} ORDER BY id`, params);
  const stats = { verifies: 0, actif: 0, ferme: 0, introuvable: 0, erreur: 0 }; const nouveaux = [];
  for (const c of cibles) {
    const r = await interroger(c.siret);
    await db.run(
      `UPDATE ${t('contractants')} SET siret_statut = $2, siret_verifie_le = now(), siret_fermeture_le = $3, siret_denomination = $4,
       siren_etat = $5, siren_cessation_le = $6, etablissements_ouverts = $7, siege_siret = $8, siege_adresse = $9 WHERE id = $1`,
      [c.id, r.statut, r.fermeture, r.denomination || null, r.siren_etat || null, r.siren_cessation_le || null, r.etablissements_ouverts ?? null, r.siege_siret || null, r.siege_adresse || null]);
    stats.verifies++; stats[r.statut]++;
    if (r.statut === 'ferme' && c.siret_statut !== 'ferme') nouveaux.push({ id: c.id, nom: c.nom, siret: c.siret, fermeture: r.fermeture });
    await pause(160);
  }
  await audit.log(user, 'contractant.siret_verifie', 'contractant', 'lot', { details: { ...stats } });
  return { ...stats, nouveaux_fermes: nouveaux };
}

module.exports = { verifier, interroger };
