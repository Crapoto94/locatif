// Extraction ASTECH (Oracle 19c, schéma ASTECHIVR) — LECTURE SEULE, mode thick (Instant Client) obligatoire :
// le mode thin échoue en NJS-116 (vérificateur de mot de passe 10G). Aucune écriture dans ASTECH, jamais.
const { config } = require('../../config');

let oracledb; let clientReady = false;
function loadOracle() {
  if (!oracledb) {
    try { oracledb = require('oracledb'); } catch { throw new Error("Module 'oracledb' absent (npm install dans backend/)"); }
  }
  if (!clientReady) {
    try { oracledb.initOracleClient({ libDir: config.astech.clientLibDir }); } catch (e) {
      if (!/already initialized/i.test(e.message)) throw new Error(`Instant Client introuvable (${config.astech.clientLibDir}) : ${e.message}`);
    }
    clientReady = true;
  }
  return oracledb;
}

async function connect(env) {
  const p = config.astech[env === 'test' ? 'test' : 'prod'];
  if (!p.host || !p.service || !p.user || !p.password) {
    throw new Error(`Paramètres ASTECH ${env} absents : renseigner ORACLE_ASTECH${env === 'test' ? '_TEST' : ''}_HOST / _PORT / _SERVICE / _USER / _PASSWORD dans le .env`);
  }
  const ora = loadOracle();
  return ora.getConnection({ user: p.user, password: p.password, connectString: `${p.host}:${p.port}/${p.service}` });
}

async function rows(conn, sql, binds = [], opts = {}) {
  const ora = loadOracle();
  const r = await conn.execute(sql, binds, { outFormat: ora.OUT_FORMAT_OBJECT, maxRows: opts.maxRows || 0, fetchInfo: opts.fetchInfo });
  return r.rows;
}

// Colonnes d'une table (pour le mode --discover et le rapport de mapping).
async function columns(conn, table) {
  return (await rows(conn, `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`, [table])).map((r) => r.COLUMN_NAME);
}

async function tableExists(conn, table) {
  return (await rows(conn, `SELECT 1 AS X FROM USER_TABLES WHERE TABLE_NAME = :t`, [table])).length > 0;
}

// ---- Normalisation ----
const pad = (n) => String(n).padStart(2, '0');
// node-oracledb renvoie un Date en fuseau LOCAL du process : on relit les composantes locales (pas d'UTC => pas de décalage d'un jour).
const fmtDate = (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : null);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

// Première colonne dont le nom correspond à l'un des motifs ET dont la valeur est renseignée.
function pick(row, ...patterns) {
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(`^${p}$`);
    for (const k of Object.keys(row)) if (re.test(k) && row[k] !== null && row[k] !== undefined && row[k] !== '') return row[k];
  }
  return null;
}
const pickKey = (row, ...patterns) => {
  for (const p of patterns) { const re = p instanceof RegExp ? p : new RegExp(`^${p}$`); const k = Object.keys(row).find((x) => re.test(x)); if (k) return k; }
  return null;
};

// Version JSON sûre d'une ligne Oracle (pour astech_raw) : dates ISO, BLOB exclus.
function raw(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    if (Buffer.isBuffer(v)) continue;
    o[k] = v instanceof Date ? fmtDate(v) : v;
  }
  return o;
}

module.exports = { connect, rows, columns, tableExists, fmtDate, num, str, pick, pickKey, raw, loadOracle };
