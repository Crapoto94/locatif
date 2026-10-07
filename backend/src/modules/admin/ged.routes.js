// Paramétrage GED / stockage (équivalent de /admin/ged) : mode, racine, Alfresco, test, explorateur, migration.
const router = require('express').Router();
const { requirePerm } = require('../../middleware/auth');
const store = require('../documents/store/store');
const svc = require('../documents/documents.service');
const audit = require('../../services/audit');
const { httpError } = require('../../shared/http');

router.use(requirePerm('admin.ged'));

router.get('/config', async (req, res) => res.json(await store.publicConfig()));

router.put('/config', async (req, res) => {
  const b = req.body || {};
  if (!['filer', 'alfresco', 'simulateur'].includes(b.mode)) throw httpError(400, 'Mode inconnu');
  // Le basculement vers Alfresco exige une connexion validée (test d'écriture / relecture).
  if (b.mode === 'alfresco') {
    const r = await store.test(b);
    if (!r.ok) throw httpError(400, `Basculement refusé : ${r.message}`);
  }
  await store.saveConfig(b);
  await audit.log(req.user, 'ged.config', 'ged', 1, { details: { mode: b.mode } });
  res.json(await store.publicConfig());
});

router.post('/test', async (req, res) => res.json(await store.test(req.body)));

router.get('/browse', async (req, res) => {
  try { res.json(await store.browse(null, req.query.path)); } catch (e) { throw httpError(502, e.message); }
});

router.post('/migrate', async (req, res) => res.json(await svc.migrateToActive(req.user)));

module.exports = router;
