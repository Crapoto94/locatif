// Paramètres généraux : nom de la ville de référence + logo (stocké dans settings, clé « general »).
// GET publics (la page de connexion en a besoin) ; écritures réservées à admin.users.
const multer = require('multer');
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const audit = require('../../services/audit');
const { httpError } = require('../../shared/http');

const DEFAUT = { ville_nom: "Ville d'Ivry-sur-Seine" };
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const lire = async () => (await db.get(`SELECT valeur FROM ${t('settings')} WHERE cle = 'general'`))?.valeur || {};
const ecrire = (v) => db.run(`INSERT INTO ${t('settings')}(cle, valeur) VALUES ('general', $1) ON CONFLICT (cle) DO UPDATE SET valeur = $1, updated_at = now()`, [JSON.stringify(v)]);
const publique = (v) => ({ ville_nom: v.ville_nom || DEFAUT.ville_nom, logo: Boolean(v.logo_b64), logo_version: v.logo_version || 0 });

const publicRouter = require('express').Router();
publicRouter.get('/', async (req, res) => res.json(publique(await lire())));
publicRouter.get('/logo', async (req, res) => {
  const v = await lire();
  if (!v.logo_b64) return res.status(404).end();
  res.set('Content-Type', v.logo_mime).set('Cache-Control', 'public, max-age=300').send(Buffer.from(v.logo_b64, 'base64'));
});

const adminRouter = require('express').Router();
adminRouter.use(requirePerm('admin.users'));
adminRouter.put('/', async (req, res) => {
  const nom = String(req.body?.ville_nom || '').trim();
  if (!nom || nom.length > 120) throw httpError(400, 'Nom de la ville requis (120 caractères max)');
  const v = await lire(); v.ville_nom = nom; await ecrire(v);
  await audit.log(req.user, 'general.updated', 'general', 1, { details: { ville_nom: nom } });
  res.json(publique(v));
});
adminRouter.post('/logo', upload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Fichier manquant');
  if (!MIMES.includes(req.file.mimetype)) throw httpError(400, 'Format accepté : PNG, JPEG, WebP ou GIF');
  const v = await lire();
  Object.assign(v, { logo_b64: req.file.buffer.toString('base64'), logo_mime: req.file.mimetype, logo_version: Date.now() });
  await ecrire(v);
  await audit.log(req.user, 'general.logo', 'general', 1, { details: { taille: req.file.size } });
  res.json(publique(v));
});
adminRouter.delete('/logo', async (req, res) => {
  const v = await lire(); delete v.logo_b64; delete v.logo_mime; v.logo_version = Date.now(); await ecrire(v);
  await audit.log(req.user, 'general.logo', 'general', 1, { details: { supprime: true } });
  res.json(publique(v));
});

module.exports = { publicRouter, adminRouter };
