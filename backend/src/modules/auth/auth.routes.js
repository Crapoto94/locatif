// Connexion : AD via l'APM (agents) ou compte administrateur local paramétré dans le .env (ADM-010/011).
const crypto = require('crypto');
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { config } = require('../../config');
const { db, t } = require('../../db');
const apm = require('../../services/apm');
const audit = require('../../services/audit');
const { authenticate, signToken, loadUser } = require('../../middleware/auth');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes' } });

const sameSecret = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

const publicUser = (u) => ({
  id: u.id, username: u.username, displayName: u.display_name, email: u.email, service: u.service,
  source: u.source, profils: u.profils, permissions: [...u.permissions],
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Connexion (AD via APM ou compte local)
 *     tags: [Auth]
 */
router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

  let userRow;
  if (config.localAdmin.enabled && username === config.localAdmin.username) {
    if (!sameSecret(password, config.localAdmin.password)) {
      await audit.log(username, 'auth.failed', 'user', username, { details: { source: 'local' } });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    userRow = await db.get(`SELECT * FROM ${t('users')} WHERE username = $1`, [username]);
  } else {
    const r = await apm.adAuthenticate(username, password);
    if (!r.success) {
      await audit.log(username, 'auth.failed', 'user', username, { details: { source: 'ad', status: r.status } });
      const down = !r.status && r.error;
      return res.status(down ? 503 : 401).json({ error: down ? `Annuaire indisponible : ${r.error}` : 'Identifiants invalides' });
    }
    const info = await apm.adUser(username);
    const display = info?.displayName || info?.display_name || info?.cn || null;
    const email = info?.mail || info?.email || null;
    const service = info?.department || info?.service || null;
    userRow = await db.get(
      `INSERT INTO ${t('users')}(username, display_name, email, service, source) VALUES ($1,$2,$3,$4,'ad')
       ON CONFLICT (username) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, ${t('users')}.display_name),
         email = COALESCE(EXCLUDED.email, ${t('users')}.email),
         service = COALESCE(EXCLUDED.service, ${t('users')}.service), updated_at = now()
       RETURNING *`, [username, display, email, service]);
    // Premier passage : profil de consultation par défaut (les droits supérieurs sont accordés par un admin).
    await db.run(
      `INSERT INTO ${t('user_profils')}(user_id, profil)
       SELECT $1, 'LECTURE' WHERE NOT EXISTS (SELECT 1 FROM ${t('user_profils')} WHERE user_id = $1)`, [userRow.id]);
  }

  if (!userRow || !userRow.actif) return res.status(403).json({ error: 'Compte désactivé' });
  await db.run(`UPDATE ${t('users')} SET last_login = now() WHERE id = $1`, [userRow.id]);
  await audit.log(username, 'auth.login', 'user', userRow.id, { details: { source: userRow.source } });
  const user = await loadUser(userRow.id);
  res.json({ token: signToken(userRow), user: publicUser(user) });
});

router.get('/me', authenticate, (req, res) => res.json(publicUser(req.user)));

module.exports = router;
