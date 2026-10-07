// Création / mise à jour avec audit champ par champ (AUD-002, CTR-ERR-001 : jamais d'écrasement silencieux).
const { db, t } = require('../db');
const audit = require('../services/audit');
const { setClause, insertParts, httpError } = require('./http');

async function createRow({ table, entite, allowed, body, user, extra = {} }) {
  const data = { ...body, ...extra };
  const ip = insertParts(data, [...allowed, ...Object.keys(extra)]);
  if (!ip.fields.length) throw httpError(400, 'Aucune donnée à enregistrer');
  return db.tx(async (tx) => {
    const row = await tx.get(`INSERT INTO ${t(table)}(${ip.cols}) VALUES (${ip.placeholders}) RETURNING *`, ip.vals);
    await audit.log(user, `${entite}.created`, entite, row.id, { details: Object.fromEntries(ip.fields.map((f, i) => [f, ip.vals[i]])) }, tx);
    return row;
  });
}

async function updateRow({ table, entite, id, allowed, body, user, motif, motifRequis = [] }) {
  return db.tx(async (tx) => {
    const avant = await tx.get(`SELECT * FROM ${t(table)} WHERE id = $1 FOR UPDATE`, [id]);
    if (!avant) throw httpError(404, 'Introuvable');
    const sc = setClause(body, allowed, 2);
    if (!sc.fields.length) return avant;
    const apres = await tx.get(`UPDATE ${t(table)} SET ${sc.sql}, updated_at = now() WHERE id = $1 RETURNING *`, [id, ...sc.vals]);
    const touches = sc.fields.filter((f) => String(avant[f] ?? '') !== String(apres[f] ?? ''));
    if (motifRequis.some((f) => touches.includes(f)) && !motif) throw httpError(400, 'Un motif est requis pour cette correction');
    await audit.logDiff(user, `${entite}.updated`, entite, id, avant, apres, sc.fields, motif, tx);
    return apres;
  });
}

module.exports = { createRow, updateRow };
