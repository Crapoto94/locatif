// Gestion Locative — API (Express 5). Routes versionnées /api/v1, JWT applicatif, schéma PostgreSQL dédié.
const express = require('express');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { config, checkConfig } = require('./src/config');
const { db, migrate, SCHEMA } = require('./src/db');
const { seedAll } = require('./src/shared/seed');
const { authenticate, requirePerm } = require('./src/middleware/auth');
const apm = require('./src/services/apm');
const hub = require('./src/services/hubdsi');
const store = require('./src/modules/documents/store/store');
const alertes = require('./src/modules/alertes/alertes.service');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// Santé (sans authentification) : app + dépendances.
app.get('/api/status', async (req, res) => {
  const [dbOk, a, h, s] = await Promise.all([
    db.get('SELECT 1 AS ok').then(() => ({ ok: true })).catch((e) => ({ ok: false, detail: e.message })),
    apm.status(), hub.status(), store.test().then((r) => ({ ok: r.ok, mode: r.mode, detail: r.ok ? undefined : r.message })),
  ]);
  const ok = dbOk.ok && s.ok;
  res.status(ok ? 200 : 503).json({ ok, app: 'gestion-locative', version: '1.0.0', schema: SCHEMA, base: dbOk, apm: a, hub: h, stockage: s, localAdmin: config.localAdmin.enabled });
});

const spec = swaggerJsdoc({
  definition: { openapi: '3.0.0', info: { title: 'Gestion Locative API', version: '1.0.0' },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }, security: [{ bearer: [] }] },
  apis: ['./src/modules/**/*.js'],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

const v1 = express.Router();
v1.use('/auth', require('./src/modules/auth/auth.routes'));
v1.use(authenticate); // tout ce qui suit exige un jeton valide
v1.use('/dashboard', require('./src/modules/dashboard/dashboard.routes'));
v1.use('/biens', require('./src/modules/biens/biens.routes'));
v1.use('/contractants/siret', require('./src/modules/siret/siret.routes'));
v1.use('/contractants', require('./src/modules/contractants/contractants.routes'));
v1.use('/contrats', require('./src/modules/contrats/contrats.routes'));
v1.use('/echeancier', require('./src/modules/echeancier/echeancier.routes'));
v1.use('/campagne', require('./src/modules/campagne/campagne.routes'));
v1.use('/revisions', require('./src/modules/revisions/revisions.routes'));
v1.use('/charges', require('./src/modules/charges/charges.routes').router);
v1.use('/documents', require('./src/modules/documents/documents.routes'));
v1.use('/generation', require('./src/modules/generation/generation.routes'));
v1.use('/alertes', require('./src/modules/alertes/alertes.routes'));
v1.use('/recherche', require('./src/modules/recherche/recherche.routes'));
v1.use('/etats', require('./src/modules/etats/etats.routes'));
v1.use('/audit', require('./src/modules/audit/audit.routes'));
v1.use('/referentiels', require('./src/modules/referentiels/referentiels.routes'));
v1.use('/ville', require('./src/modules/ville/ville.routes'));
v1.use('/admin/users', require('./src/modules/admin/users.routes'));
v1.use('/admin/ged', require('./src/modules/admin/ged.routes'));
v1.use('/admin/reprise', require('./src/modules/reprise/reprise.routes'));
app.use('/api/v1', v1);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Erreurs normalisées { error } — jamais de trace ni de secret côté client.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux' });
  const status = err.status || (err.code === '23505' ? 409 : err.code === '23503' ? 409 : 500);
  if (status >= 500) console.error('[ERR]', req.method, req.originalUrl, err.stack || err.message);
  const message = err.code === '23505' ? 'Cet enregistrement existe déjà' : err.code === '23503' ? 'Opération impossible : des données y sont rattachées'
    : status >= 500 ? 'Erreur interne du serveur' : err.message;
  res.status(status).json({ error: message });
});

// Planification quotidienne : recalcul des alertes + notification (SCHEDULER_ENABLED=true).
function planifier() {
  if (!config.scheduler.enabled) return;
  let dernier = '';
  setInterval(async () => {
    const now = new Date(); const jour = now.toISOString().slice(0, 10);
    if (now.getHours() !== config.scheduler.heure || dernier === jour) return;
    dernier = jour;
    try { console.log('[SCHED] alertes :', await alertes.calculer(), await alertes.notifier()); } catch (e) { console.error('[SCHED]', e.message); }
  }, 5 * 60 * 1000);
  console.log(`[SCHED] actif, exécution quotidienne à ${config.scheduler.heure}h`);
}

async function start() {
  checkConfig();
  await migrate();
  await seedAll();
  app.listen(config.port, () => console.log(`[API] Gestion Locative — http://localhost:${config.port} (schéma ${SCHEMA})`));
  planifier();
}

if (require.main === module) start().catch((e) => { console.error('Démarrage impossible :', e.message); process.exit(1); });
module.exports = { app, start };
