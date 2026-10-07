// Authentification JWT applicatif + contrôle des permissions (profil × permission).
const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { db, t } = require('../db');

const AUD = 'gestion-locative';
const CACHE_MS = 20_000;
const cache = new Map(); // userId -> { at, user }

async function loadUser(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
  const u = await db.get(`SELECT id, username, display_name, email, service, source, actif FROM ${t('users')} WHERE id = $1`, [id]);
  if (!u || !u.actif) { cache.delete(id); return null; }
  const profils = await db.all(`SELECT profil FROM ${t('user_profils')} WHERE user_id = $1`, [id]);
  const perms = await db.all(
    `SELECT DISTINCT pp.permission FROM ${t('profil_permissions')} pp
       JOIN ${t('user_profils')} up ON up.profil = pp.profil WHERE up.user_id = $1`, [id]);
  const user = { ...u, profils: profils.map((p) => p.profil), permissions: new Set(perms.map((p) => p.permission)) };
  cache.set(id, { at: Date.now(), user });
  return user;
}

const invalidateUsers = () => cache.clear();

function signToken(user) {
  // Audience propre à l'application : un jeton émis par une autre application avec le même secret est refusé.
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, { expiresIn: config.jwtTtl, audience: AUD });
}

async function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || null);
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, config.jwtSecret, { audience: AUD });
    const user = await loadUser(payload.sub);
    if (!user) return res.status(401).json({ error: 'Compte inconnu ou désactivé' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Jeton invalide ou expiré' });
  }
}

// Toutes les permissions listées sont requises.
const requirePerm = (...perms) => (req, res, next) => {
  const missing = perms.filter((p) => !req.user.permissions.has(p));
  if (missing.length) return res.status(403).json({ error: `Droit insuffisant (${missing.join(', ')})` });
  next();
};

const can = (req, perm) => req.user.permissions.has(perm);

module.exports = { authenticate, requirePerm, signToken, invalidateUsers, loadUser, can };
