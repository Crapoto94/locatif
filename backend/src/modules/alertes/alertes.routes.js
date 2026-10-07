// Centre des alertes (ALT) : réaffectation et traitement (action ou commentaire obligatoire), tout est tracé.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pageParams, whereBuilder, httpError } = require('../../shared/http');
const audit = require('../../services/audit');
const svc = require('./alertes.service');

router.get('/', requirePerm('alertes.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query, { def: 50 });
  const w = whereBuilder();
  w.add('a.statut = ?', req.query.statut === 'traitee' ? 'traitee' : 'active');
  if (req.query.type) w.add('a.type = ?', req.query.type);
  if (req.query.assigne === 'moi') w.add('a.assigne_a = ?', req.user.username);
  const base = `FROM ${t('alertes')} a ${w.clause()}`;
  const total = (await db.get(`SELECT count(*)::int AS n ${base}`, w.params)).n;
  const rows = await db.all(
    `SELECT a.*, CASE a.objet_type WHEN 'contrat' THEN (SELECT numero FROM ${t('contrats')} WHERE id = a.objet_id)
                                    WHEN 'bien' THEN (SELECT designation FROM ${t('biens')} WHERE id = a.objet_id) END AS objet_libelle,
            CASE WHEN a.date_cible IS NOT NULL THEN (a.date_cible - CURRENT_DATE) END AS jours_restants
     ${base} ORDER BY a.date_cible NULLS LAST, a.id DESC LIMIT ${limit} OFFSET ${offset}`, w.params);
  res.json({ total, rows });
});

router.get('/compteurs', requirePerm('alertes.read'), async (req, res) => {
  res.json(await db.all(`SELECT type, count(*)::int AS n FROM ${t('alertes')} WHERE statut = 'active' GROUP BY type ORDER BY n DESC`));
});

router.get('/parametres', requirePerm('alertes.read'), async (req, res) => res.json(await svc.params()));
router.put('/parametres', requirePerm('referentiels.write'), async (req, res) => {
  await db.run(`INSERT INTO ${t('settings')}(cle, valeur) VALUES ('alertes', $1) ON CONFLICT (cle) DO UPDATE SET valeur = $1, updated_at = now()`, [JSON.stringify(req.body)]);
  await audit.log(req.user, 'alert.settings_updated', 'alerte', 'parametres', { details: req.body });
  res.json(await svc.params());
});

router.post('/recalculer', requirePerm('alertes.write'), async (req, res) => {
  const r = await svc.calculer();
  const n = req.body?.notifier ? await svc.notifier() : null;
  res.json({ ...r, notification: n });
});

// Alerte manuelle (ex. anomalie technique)
router.post('/', requirePerm('alertes.write'), async (req, res) => {
  const b = req.body || {};
  if (!b.titre) throw httpError(400, 'Le titre est obligatoire');
  const row = await db.get(
    `INSERT INTO ${t('alertes')}(cle, type, objet_type, objet_id, titre, message, date_cible, assigne_a) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [`manuelle|${Date.now()}`, b.type || 'anomalie_technique', b.objet_type || null, b.objet_id || null, b.titre, b.message || null, b.date_cible || null, b.assigne_a || null]);
  await audit.log(req.user, 'alert.created', 'alerte', row.id, { details: row });
  res.status(201).json(row);
});

router.post('/:id/reaffecter', requirePerm('alertes.write'), async (req, res) => {
  const a = await db.get(`SELECT * FROM ${t('alertes')} WHERE id = $1`, [req.params.id]);
  if (!a) throw httpError(404, 'Alerte introuvable');
  const vers = String(req.body?.vers || '').trim().toLowerCase();
  if (!vers) throw httpError(400, 'Nouveau responsable obligatoire');
  await db.tx(async (tx) => {
    await tx.run(`UPDATE ${t('alertes')} SET assigne_a = $2, notifie_le = NULL WHERE id = $1`, [a.id, vers]);
    await tx.run(`INSERT INTO ${t('alertes_historique')}(alerte_id, action, de, vers, commentaire, utilisateur) VALUES ($1,'reaffectation',$2,$3,$4,$5)`, [a.id, a.assigne_a, vers, req.body?.commentaire || null, req.user.username]);
    await audit.log(req.user, 'alert.reassigned', 'alerte', a.id, { champ: 'assigne_a', ancienne: a.assigne_a, nouvelle: vers, motif: req.body?.commentaire }, tx);
  });
  res.json({ ok: true });
});

router.post('/:id/traiter', requirePerm('alertes.write'), async (req, res) => {
  const a = await db.get(`SELECT * FROM ${t('alertes')} WHERE id = $1`, [req.params.id]);
  if (!a) throw httpError(404, 'Alerte introuvable');
  const traitement = String(req.body?.traitement || '').trim();
  if (!traitement) throw httpError(400, 'Une action ou un commentaire est obligatoire (ALT-006)');
  await db.tx(async (tx) => {
    await tx.run(`UPDATE ${t('alertes')} SET statut = 'traitee', traite_par = $2, traite_le = now(), traitement = $3 WHERE id = $1`, [a.id, req.user.username, traitement]);
    await tx.run(`INSERT INTO ${t('alertes_historique')}(alerte_id, action, commentaire, utilisateur) VALUES ($1,'traitement',$2,$3)`, [a.id, traitement, req.user.username]);
    await audit.log(req.user, 'alert.handled', 'alerte', a.id, { champ: 'statut', ancienne: 'active', nouvelle: 'traitee', motif: traitement }, tx);
  });
  res.json({ ok: true });
});

router.get('/:id/historique', requirePerm('alertes.read'), async (req, res) => {
  res.json(await db.all(`SELECT * FROM ${t('alertes_historique')} WHERE alerte_id = $1 ORDER BY ts DESC`, [req.params.id]));
});

module.exports = router;
