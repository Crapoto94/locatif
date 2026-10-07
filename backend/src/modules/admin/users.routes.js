// Administration des comptes, profils et droits (maquette 28). Un compte n'est jamais supprimé, seulement désactivé.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm, invalidateUsers } = require('../../middleware/auth');
const { httpError } = require('../../shared/http');
const { PERMISSIONS } = require('../../shared/permissions');
const apm = require('../../services/apm');
const audit = require('../../services/audit');

router.use(requirePerm('admin.users'));

router.get('/', async (req, res) => {
  res.json(await db.all(
    `SELECT u.id, u.username, u.display_name, u.email, u.service, u.source, u.actif, u.last_login,
            COALESCE((SELECT array_agg(profil ORDER BY profil) FROM ${t('user_profils')} WHERE user_id = u.id), '{}') AS profils
     FROM ${t('users')} u ORDER BY u.actif DESC, u.display_name NULLS LAST, u.username`));
});

// Recherche d'agents dans l'AD (via l'APM) pour pré-créer un compte.
router.get('/ad-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  res.json(await apm.adSearch(q));
});

router.post('/', async (req, res) => {
  const b = req.body || {}; const username = String(b.username || '').trim().toLowerCase();
  if (!username) throw httpError(400, 'Identifiant obligatoire');
  const u = await db.get(
    `INSERT INTO ${t('users')}(username, display_name, email, service, source) VALUES ($1,$2,$3,$4,'ad')
     ON CONFLICT (username) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, ${t('users')}.display_name), email = COALESCE(EXCLUDED.email, ${t('users')}.email) RETURNING *`,
    [username, b.display_name || null, b.email || null, b.service || null]);
  for (const p of (b.profils?.length ? b.profils : ['LECTURE'])) await db.run(`INSERT INTO ${t('user_profils')}(user_id, profil) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.id, p]);
  await audit.log(req.user, 'user.created', 'user', u.id, { details: { username, profils: b.profils } });
  invalidateUsers();
  res.status(201).json(u);
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10); const b = req.body || {};
  const u = await db.get(`SELECT * FROM ${t('users')} WHERE id = $1`, [id]);
  if (!u) throw httpError(404, 'Compte introuvable');
  if (id === req.user.id && (b.actif === false)) throw httpError(400, 'Vous ne pouvez pas désactiver votre propre compte');
  await db.tx(async (tx) => {
    if (b.actif !== undefined) {
      await tx.run(`UPDATE ${t('users')} SET actif = $2, updated_at = now() WHERE id = $1`, [id, Boolean(b.actif)]);
      await audit.log(req.user, 'user.updated', 'user', id, { champ: 'actif', ancienne: u.actif, nouvelle: Boolean(b.actif) }, tx);
    }
    if (b.email !== undefined || b.display_name !== undefined) {
      await tx.run(`UPDATE ${t('users')} SET email = COALESCE($2,email), display_name = COALESCE($3,display_name), updated_at = now() WHERE id = $1`, [id, b.email ?? null, b.display_name ?? null]);
    }
    if (Array.isArray(b.profils)) {
      const avant = (await tx.all(`SELECT profil FROM ${t('user_profils')} WHERE user_id = $1 ORDER BY 1`, [id])).map((r) => r.profil);
      // Garde-fou : on ne retire jamais le dernier ADMIN_GL actif.
      if (avant.includes('ADMIN_GL') && !b.profils.includes('ADMIN_GL')) {
        const n = await tx.get(`SELECT count(*)::int AS n FROM ${t('user_profils')} up JOIN ${t('users')} u ON u.id = up.user_id AND u.actif WHERE up.profil = 'ADMIN_GL'`);
        if (n.n <= 1) throw httpError(400, 'Impossible de retirer le dernier administrateur');
      }
      await tx.run(`DELETE FROM ${t('user_profils')} WHERE user_id = $1`, [id]);
      for (const p of b.profils) await tx.run(`INSERT INTO ${t('user_profils')}(user_id, profil) VALUES ($1,$2)`, [id, p]);
      await audit.log(req.user, 'user.profiles_changed', 'user', id, { champ: 'profils', ancienne: avant.join(','), nouvelle: [...b.profils].sort().join(',') }, tx);
    }
  });
  invalidateUsers();
  res.json({ ok: true });
});

// ---- Profils et matrice des droits ----
router.get('/permissions', async (req, res) => res.json(PERMISSIONS));

router.get('/profils', async (req, res) => {
  const profils = await db.all(`SELECT * FROM ${t('profils')} ORDER BY code`);
  const perms = await db.all(`SELECT profil, permission FROM ${t('profil_permissions')}`);
  res.json(profils.map((p) => ({ ...p, permissions: perms.filter((x) => x.profil === p.code).map((x) => x.permission) })));
});

router.post('/profils', async (req, res) => {
  const { code, libelle } = req.body || {};
  if (!/^[A-Z0-9_]{2,30}$/.test(code || '') || !libelle) throw httpError(400, 'Code (MAJUSCULES_) et libellé obligatoires');
  await db.run(`INSERT INTO ${t('profils')}(code, libelle) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [code, libelle]);
  await audit.log(req.user, 'profile.created', 'profil', code, { details: { libelle } });
  res.status(201).json({ code, libelle, permissions: [] });
});

router.put('/profils/:code/permissions', async (req, res) => {
  const code = req.params.code; const perms = (req.body?.permissions || []).filter((p) => PERMISSIONS.some((x) => x.code === p));
  if (code === 'ADMIN_GL' && !['admin.users', 'admin.ged'].every((p) => perms.includes(p))) throw httpError(400, "ADMIN_GL doit conserver l'administration des comptes et de la GED");
  await db.tx(async (tx) => {
    const avant = (await tx.all(`SELECT permission FROM ${t('profil_permissions')} WHERE profil = $1 ORDER BY 1`, [code])).map((r) => r.permission);
    await tx.run(`DELETE FROM ${t('profil_permissions')} WHERE profil = $1`, [code]);
    for (const p of perms) await tx.run(`INSERT INTO ${t('profil_permissions')}(profil, permission) VALUES ($1,$2)`, [code, p]);
    await audit.log(req.user, 'profile.permissions_changed', 'profil', code, { champ: 'permissions', ancienne: avant.join(','), nouvelle: [...perms].sort().join(',') }, tx);
  });
  invalidateUsers();
  res.json({ ok: true });
});

module.exports = router;
