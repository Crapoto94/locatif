// Mise à jour automatique des indices depuis l'INSEE (Banque de données macroéconomiques, SDMX public, sans clé) — REV-005.
// Règles : une valeur absente est ajoutée ; une valeur non renseignée est complétée ; une valeur déjà saisie qui DIFFÈRE de l'INSEE
// n'est JAMAIS écrasée (tolérance zéro) : elle est signalée « écart » pour décision humaine. Un indice non encore publié reste absent :
// aucune valeur n'est inventée (REV-008).
const axios = require('axios');
const { config } = require('../../config');
const { db, t } = require('../../db');
const audit = require('../../services/audit');

const BASE = (process.env.INSEE_BDM_URL || 'https://www.bdm.insee.fr/series/sdmx/data/SERIES_BDM').replace(/\/$/, '');
// Séries (idbank) : IRL, ICC, ILC, ILAT. Surchargeable par le référentiel `type_indice` (meta.idbank) pour ajouter d'autres indices.
const SERIES = { IRL: '001515333', ICC: '000008630', ILC: '001532540', ILAT: '001617112' };

async function series() {
  const refs = await db.all(`SELECT code, meta FROM ${t('ref_valeurs')} WHERE domaine = 'type_indice' AND actif`);
  const out = { ...SERIES };
  for (const r of refs) if (r.meta?.idbank) out[r.code] = String(r.meta.idbank);
  return out;
}

async function observations(idbank) {
  const { data } = await axios.get(`${BASE}/${idbank}`, { timeout: 30000, responseType: 'text', headers: { Accept: 'application/xml' } });
  const obs = [];
  for (const m of String(data).matchAll(/<Obs\s+([^>]*?)\/?>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/([A-Z_]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const q = /^(\d{4})-Q([1-4])$/.exec(a.TIME_PERIOD || '');
    const valeur = parseFloat(a.OBS_VALUE);
    if (q && Number.isFinite(valeur)) obs.push({ annee: Number(q[1]), trimestre: Number(q[2]), valeur, publie: a.DATE_JO || null });
  }
  return obs;
}

async function synchroniser(user) {
  const depuis = Number(config.repriseDepuis.slice(0, 4));
  const bilan = { ajoutes: [], completes: [], ecarts: [], conformes: 0, erreurs: [] };
  const maintenant = new Date();
  for (const [type, idbank] of Object.entries(await series())) {
    let obs;
    try { obs = await observations(idbank); } catch (e) { bilan.erreurs.push(`${type} : ${e.message}`); continue; }
    for (const o of obs.filter((x) => x.annee >= depuis)) {
      const ex = await db.get(`SELECT * FROM ${t('indices_valeurs')} WHERE type_code = $1 AND annee = $2 AND trimestre = $3`, [type, o.annee, o.trimestre]);
      const lib = `${type} ${o.annee} TRIM 0${o.trimestre}`;
      if (!ex) {
        await db.run(`INSERT INTO ${t('indices_valeurs')}(type_code, annee, trimestre, libelle, valeur, valeur_insee, date_publication, statut_insee, verifie_le, source)
                      VALUES ($1,$2,$3,$4,$5,$5,$6,'ajoute',$7,'insee')`, [type, o.annee, o.trimestre, lib, o.valeur, o.publie, maintenant]);
        bilan.ajoutes.push({ type, annee: o.annee, trimestre: o.trimestre, valeur: o.valeur });
      } else if (ex.valeur === null) {
        await db.run(`UPDATE ${t('indices_valeurs')} SET valeur = $2, valeur_insee = $2, date_publication = COALESCE(date_publication, $3), statut_insee = 'ajoute', verifie_le = $4 WHERE id = $1`, [ex.id, o.valeur, o.publie, maintenant]);
        bilan.completes.push({ type, annee: o.annee, trimestre: o.trimestre, valeur: o.valeur });
      } else if (Math.abs(Number(ex.valeur) - o.valeur) > 1e-9) {
        await db.run(`UPDATE ${t('indices_valeurs')} SET valeur_insee = $2, statut_insee = 'ecart', verifie_le = $3 WHERE id = $1`, [ex.id, o.valeur, maintenant]);
        bilan.ecarts.push({ type, annee: o.annee, trimestre: o.trimestre, valeur: Number(ex.valeur), valeur_insee: o.valeur });
      } else {
        await db.run(`UPDATE ${t('indices_valeurs')} SET valeur_insee = $2, statut_insee = 'conforme', verifie_le = $3, date_publication = COALESCE(date_publication, $4) WHERE id = $1`, [ex.id, o.valeur, maintenant, o.publie]);
        bilan.conformes++;
      }
    }
  }
  await db.run(`INSERT INTO ${t('settings')}(cle, valeur) VALUES ('indices_sync', $1) ON CONFLICT (cle) DO UPDATE SET valeur = $1, updated_at = now()`,
    [JSON.stringify({ le: maintenant.toISOString(), ajoutes: bilan.ajoutes.length, completes: bilan.completes.length, ecarts: bilan.ecarts.length, conformes: bilan.conformes, erreurs: bilan.erreurs })]);
  await audit.log(user, 'index.synchronized', 'indice', 'insee', { details: { ajoutes: bilan.ajoutes.length, completes: bilan.completes.length, ecarts: bilan.ecarts.length, conformes: bilan.conformes } });
  return bilan;
}

module.exports = { synchroniser, observations, SERIES };
