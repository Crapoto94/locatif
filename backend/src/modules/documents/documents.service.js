// Cœur documentaire : un document = une ligne + des versions + des liens vers N objets (DOC-001, DOC-008).
const { db, t } = require('../../db');
const store = require('./store/store');
const audit = require('../../services/audit');

const OBJETS = ['bien', 'contrat', 'contractant', 'alerte', 'regularisation'];
const folderFor = (links) => {
  const l = links?.[0];
  return l ? `${l.objet_type}s/${l.objet_id}` : 'divers';
};

async function addLinks(runner, docId, links = []) {
  for (const l of links) {
    if (!OBJETS.includes(l.objet_type) || !Number.isInteger(Number(l.objet_id))) continue;
    await runner.run(`INSERT INTO ${t('document_liens')}(document_id, objet_type, objet_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [docId, l.objet_type, Number(l.objet_id)]);
  }
}

async function typeEstSensible(typeCode) {
  if (!typeCode) return false;
  const r = await db.get(`SELECT meta FROM ${t('ref_valeurs')} WHERE domaine = 'type_document' AND code = $1`, [typeCode]);
  return Boolean(r?.meta?.sensible);
}

// Crée un document (stockage d'abord : en cas d'échec, rien n'est écrit en base — aucun repli silencieux).
async function create(user, { buffer, nom, mime, type_code, sensible, links, date_attendue, date_expiration, commentaire, astech_id }) {
  const stored = await store.put({ buffer, nom, mime, folder: folderFor(links) });
  const sens = sensible ?? await typeEstSensible(type_code);
  return db.tx(async (tx) => {
    const d = await tx.get(
      `INSERT INTO ${t('documents')}(nom, type_code, mime, taille, sha256, storage_key, sensible, date_attendue, date_expiration, commentaire, auteur, astech_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [nom, type_code || null, mime || null, stored.taille, stored.sha256, stored.storageKey, Boolean(sens),
        date_attendue || null, date_expiration || null, commentaire || null, user?.username || null, astech_id || null]);
    await tx.run(`INSERT INTO ${t('document_versions')}(document_id, version, storage_key, sha256, taille, auteur) VALUES ($1,1,$2,$3,$4,$5)`,
      [d.id, stored.storageKey, stored.sha256, stored.taille, user?.username || null]);
    await addLinks(tx, d.id, links);
    await audit.log(user, 'document.created', 'document', d.id, { details: { nom, type_code } }, tx);
    return d;
  });
}

// Nouvelle version : un document inchangé (même empreinte) n'est pas redéposé.
async function addVersion(user, id, { buffer, nom, mime }) {
  const d = await db.get(`SELECT * FROM ${t('documents')} WHERE id = $1 AND actif`, [id]);
  if (!d) return null;
  const sha = store.sha256(buffer);
  if (sha === d.sha256) return { ...d, inchange: true };
  const replaceKey = d.storage_key.startsWith('alf:') ? d.storage_key : undefined;
  const stored = await store.put({ buffer, nom: nom || d.nom, mime, replaceKey, folder: `documents/${id}` });
  const version = d.version + 1;
  await db.tx(async (tx) => {
    await tx.run(`UPDATE ${t('documents')} SET version=$2, storage_key=$3, sha256=$4, taille=$5, mime=COALESCE($6,mime), updated_at=now() WHERE id=$1`,
      [id, version, stored.storageKey, stored.sha256, stored.taille, mime || null]);
    await tx.run(`INSERT INTO ${t('document_versions')}(document_id, version, storage_key, sha256, taille, auteur) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, version, stored.storageKey, stored.sha256, stored.taille, user?.username || null]);
    await audit.log(user, 'document.versioned', 'document', id, { champ: 'version', ancienne: d.version, nouvelle: version }, tx);
  });
  return db.get(`SELECT * FROM ${t('documents')} WHERE id = $1`, [id]);
}

async function list({ objet_type, objet_id, type_code, q, sensibleOk, limit, offset }) {
  const params = []; const conds = ['d.actif'];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  let join = '';
  if (objet_type && objet_id) {
    join = `JOIN ${t('document_liens')} l ON l.document_id = d.id AND l.objet_type = ${p(objet_type)} AND l.objet_id = ${p(Number(objet_id))}`;
  }
  if (type_code) conds.push(`d.type_code = ${p(type_code)}`);
  if (q) conds.push(`d.nom ILIKE ${p(`%${q}%`)}`);
  const sql = `FROM ${t('documents')} d ${join} WHERE ${conds.join(' AND ')}`;
  const total = (await db.get(`SELECT count(*)::int AS n ${sql}`, params)).n;
  const rows = await db.all(
    `SELECT d.id, d.nom, d.type_code, d.mime, d.taille, d.version, d.sensible, d.date_attendue, d.date_expiration, d.commentaire,
            d.auteur, d.created_at, d.updated_at, d.storage_key LIKE 'alf:%' AS en_ged,
            (SELECT json_agg(json_build_object('objet_type', objet_type, 'objet_id', objet_id)) FROM ${t('document_liens')} WHERE document_id = d.id) AS liens
     ${sql} ORDER BY d.updated_at DESC LIMIT ${p(limit)} OFFSET ${p(offset)}`, params);
  return { total, rows: rows.map((r) => ({ ...r, verrouille: r.sensible && !sensibleOk })) };
}

// Migration du stockage : relit chaque fichier dans son stockage d'origine et le dépose dans le stockage actif.
async function migrateToActive(user) {
  const active = await store.active();
  const docs = await db.all(`SELECT id, nom, mime, storage_key FROM ${t('documents')} WHERE actif AND storage_key NOT LIKE $1`, [`${active.prefix}:%`]);
  let ok = 0; const erreurs = [];
  for (const d of docs) {
    try {
      const { buffer } = await store.get(d.storage_key);
      const r = await store.put({ buffer, nom: d.nom, mime: d.mime, folder: `documents/${d.id}` });
      await db.tx(async (tx) => {
        await tx.run(`UPDATE ${t('documents')} SET storage_key = $2 WHERE id = $1`, [d.id, r.storageKey]);
        await tx.run(`UPDATE ${t('document_versions')} SET storage_key = $2 WHERE document_id = $1 AND storage_key = $3`, [d.id, r.storageKey, d.storage_key]);
      });
      ok++;
    } catch (e) { erreurs.push({ id: d.id, nom: d.nom, message: e.message }); }
  }
  await audit.log(user, 'ged.migrated', 'ged', 1, { details: { migres: ok, erreurs: erreurs.length, cible: active.prefix } });
  return { total: docs.length, migres: ok, erreurs };
}

module.exports = { create, addVersion, addLinks, list, migrateToActive, typeEstSensible, OBJETS };
