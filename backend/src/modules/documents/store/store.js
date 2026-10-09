// DocumentStorePort : l'application ne parle qu'à ce port ; l'adaptateur (filer, Alfresco, simulateur)
// est choisi dans /admin/ged (table ged_config). Les clés de stockage coexistent : fs: / alf: / sim:.
// Aucun repli silencieux : si le stockage actif est injoignable, l'écriture est refusée (DOC-018).
const crypto = require('crypto');
const { db, t } = require('../../../db');
const { config } = require('../../../config');
const filer = require('./filer.adapter');
const alfresco = require('./alfresco.adapter');

const KEY = crypto.createHash('sha256').update(config.storage.secret).digest();

function encrypt(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(b64) {
  if (!b64) return '';
  const raw = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

async function getConfig() {
  const row = await db.get(`SELECT * FROM ${t('ged_config')} WHERE id = 1`);
  return row || { mode: 'filer', filer_root: null };
}

// Adaptateur actif pour les écritures.
async function active() {
  const c = await getConfig();
  if (c.mode === 'alfresco') return alfresco.create({ ...c, password: decrypt(c.alfresco_password_enc) });
  if (c.mode === 'simulateur') return filer.create({ root: filer.simRoot(), prefix: 'sim' });
  return filer.create({ root: c.filer_root || config.storage.filerRoot, prefix: 'fs' });
}

// Adaptateur pour la lecture, déduit du préfixe de la clé (permet la coexistence après migration).
async function forKey(storageKey) {
  const c = await getConfig();
  if (storageKey.startsWith('alf:')) return alfresco.create({ ...c, password: decrypt(c.alfresco_password_enc) });
  if (storageKey.startsWith('sim:')) return filer.create({ root: filer.simRoot(), prefix: 'sim' });
  return filer.create({ root: c.filer_root || config.storage.filerRoot, prefix: 'fs' });
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function put({ buffer, nom, folder, mime, replaceKey }) {
  const a = await active();
  const r = await a.put({ buffer, nom, folder, mime, replaceKey });
  return { storageKey: r.key, sha256: sha256(buffer), taille: buffer.length };
}

async function get(storageKey) { return (await forKey(storageKey)).get(storageKey); }
async function remove(storageKey) { return (await forKey(storageKey)).remove(storageKey); }

// Paramétrage exposé à l'admin : le mot de passe n'est jamais renvoyé, seul « défini » l'est.
async function publicConfig() {
  const c = await getConfig();
  return {
    mode: c.mode, filerRoot: c.filer_root || '', filerRootEffectif: c.filer_root || config.storage.filerRoot,
    alfrescoUrl: c.alfresco_url || '', alfrescoLogin: c.alfresco_login || '',
    alfrescoPasswordDefini: Boolean(c.alfresco_password_enc), alfrescoRoot: c.alfresco_root || '',
    archivageActif: Boolean(c.archivage_actif),
  };
}

async function saveConfig(b) {
  const prev = await getConfig();
  const pwd = b.alfrescoPassword ? encrypt(b.alfrescoPassword) : prev.alfresco_password_enc || null;
  await db.run(
    `INSERT INTO ${t('ged_config')}(id, mode, filer_root, alfresco_url, alfresco_login, alfresco_password_enc, alfresco_root, archivage_actif, updated_at)
     VALUES (1,$1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (id) DO UPDATE SET mode=$1, filer_root=$2, alfresco_url=$3, alfresco_login=$4,
       alfresco_password_enc=$5, alfresco_root=$6, archivage_actif=$7, updated_at=now()`,
    [b.mode || 'filer', b.filerRoot || null, b.alfrescoUrl || null, b.alfrescoLogin || null, pwd, b.alfrescoRoot || null, Boolean(b.archivageActif)]);
}

// Test de connexion avec diagnostic lisible (écriture + relecture d'un fichier témoin).
async function test(override) {
  const base = await getConfig();
  const c = { ...base, ...(override ? {
    mode: override.mode || base.mode, filer_root: override.filerRoot ?? base.filer_root,
    alfresco_url: override.alfrescoUrl ?? base.alfresco_url, alfresco_login: override.alfrescoLogin ?? base.alfresco_login,
    alfresco_root: override.alfrescoRoot ?? base.alfresco_root,
    alfresco_password_enc: override.alfrescoPassword ? encrypt(override.alfrescoPassword) : base.alfresco_password_enc,
  } : {}) };
  const t0 = Date.now();
  try {
    let a;
    if (c.mode === 'alfresco') a = alfresco.create({ ...c, password: decrypt(c.alfresco_password_enc) });
    else if (c.mode === 'simulateur') a = filer.create({ root: filer.simRoot(), prefix: 'sim' });
    else a = filer.create({ root: c.filer_root || config.storage.filerRoot, prefix: 'fs' });
    const detail = await a.test();
    return { ok: true, mode: c.mode, ms: Date.now() - t0, ...detail };
  } catch (e) {
    return { ok: false, mode: c.mode, ms: Date.now() - t0, message: e.message };
  }
}

async function browse(mode, relPath) {
  const a = await active();
  if (!a.browse) throw new Error("L'explorateur n'est pas disponible pour ce mode");
  return a.browse(relPath || '');
}

module.exports = { put, get, remove, publicConfig, saveConfig, test, browse, active, forKey, sha256, getConfig, decrypt, encrypt };
