// Accès PostgreSQL (schéma dédié) + migrations numérotées.
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const { config } = require('./config');

// DATE (1082) et NUMERIC (1700) : renvoyer des chaînes ISO / nombres, jamais d'objet Date décalé par le fuseau.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const SCHEMA = config.pg.schema;
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.pg.host, port: config.pg.port, database: config.pg.database,
      user: config.pg.user, password: config.pg.password, max: 10,
      options: '-c timezone=Europe/Paris',
    });
    pool.on('error', (e) => console.error('[DB] erreur pool :', e.message));
  }
  return pool;
}

const db = {
  all: (sql, p = []) => getPool().query(sql, p).then((r) => r.rows),
  get: (sql, p = []) => getPool().query(sql, p).then((r) => r.rows[0]),
  run: (sql, p = []) => getPool().query(sql, p).then((r) => ({ changes: r.rowCount, rows: r.rows })),
  tx: async (fn) => {
    const client = await getPool().connect();
    const tx = {
      all: (s, p = []) => client.query(s, p).then((r) => r.rows),
      get: (s, p = []) => client.query(s, p).then((r) => r.rows[0]),
      run: (s, p = []) => client.query(s, p).then((r) => ({ changes: r.rowCount, rows: r.rows })),
    };
    try {
      await client.query('BEGIN');
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
};

// Nom de table qualifié : t('contrats') -> locatif.contrats
const t = (name) => `${SCHEMA}.${name}`;

async function migrate() {
  await getPool().query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await getPool().query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (
    nom VARCHAR(200) PRIMARY KEY, applique_le TIMESTAMPTZ DEFAULT now())`);
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.all(`SELECT nom FROM ${SCHEMA}.schema_migrations`)).map((r) => r.nom));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\{\{schema\}\}/g, SCHEMA);
    await db.tx(async (tx) => {
      await tx.run(sql);
      await tx.run(`INSERT INTO ${SCHEMA}.schema_migrations(nom) VALUES ($1)`, [f]);
    });
    console.log(`[DB] migration appliquée : ${f}`);
  }
}

module.exports = { db, t, SCHEMA, migrate, getPool };
