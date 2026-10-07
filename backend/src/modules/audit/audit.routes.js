// Historique / traçabilité (maquette 26) : qui, quand, quoi, ancienne / nouvelle valeur, motif.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pageParams, whereBuilder, like } = require('../../shared/http');

router.get('/', requirePerm('audit.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query, { def: 50, max: 500 });
  const w = whereBuilder(); const q = req.query;
  if (q.entite) w.add('entite = ?', q.entite);
  if (q.entite_id) w.add('entite_id = ?', String(q.entite_id));
  if (q.utilisateur) w.add('utilisateur ILIKE ?', like(q.utilisateur));
  if (q.evenement) w.add('evenement ILIKE ?', like(q.evenement));
  if (q.du) w.add('ts >= ?', q.du);
  if (q.au) w.add("ts < (?::date + 1)", q.au);
  if (q.q) w.add('(ancienne_valeur ILIKE ? OR nouvelle_valeur ILIKE ? OR motif ILIKE ? OR champ ILIKE ?)', like(q.q));
  const base = `FROM ${t('audit_log')} ${w.clause()}`;
  const total = (await db.get(`SELECT count(*)::int AS n ${base}`, w.params)).n;
  const rows = await db.all(`SELECT * ${base} ORDER BY ts DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, w.params);
  res.json({ total, rows });
});

router.get('/evenements', requirePerm('audit.read'), async (req, res) => {
  res.json(await db.all(`SELECT evenement, count(*)::int AS n FROM ${t('audit_log')} GROUP BY 1 ORDER BY 2 DESC LIMIT 100`));
});

module.exports = router;
