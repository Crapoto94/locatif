// Recherche globale (REC) : contrat, adresse du bien, nom du contractant, adresse du contractant, références financières.
const router = require('express').Router();
const { db, t } = require('../../db');
const { authenticate, can } = require('../../middleware/auth');
const { like, httpError } = require('../../shared/http');

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ q, contrats: [], biens: [], contractants: [], echeances: [] });
  const p = like(q); const lim = Math.min(parseInt(req.query.limit, 10) || 8, 30);
  const out = { q, contrats: [], biens: [], contractants: [], echeances: [] };
  if (can(req, 'contrats.read')) {
    out.contrats = await db.all(
      `SELECT DISTINCT c.id, c.numero, c.type_code, c.statut_code, c.objet FROM ${t('contrats')} c
         LEFT JOIN ${t('contrat_contractants')} cc ON cc.contrat_id = c.id LEFT JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id
       WHERE c.numero ILIKE $1 OR c.objet ILIKE $1 OR ct.nom ILIKE $1 OR ct.tiers_sedit_id ILIKE $1 ORDER BY c.numero LIMIT ${lim}`, [p]);
  }
  if (can(req, 'biens.read')) {
    out.biens = await db.all(`SELECT id, designation, adresse, ville, type_code, code FROM ${t('biens')} WHERE designation ILIKE $1 OR adresse ILIKE $1 OR code ILIKE $1 OR reference_cadastrale ILIKE $1 ORDER BY designation LIMIT ${lim}`, [p]);
  }
  if (can(req, 'contractants.read')) {
    out.contractants = await db.all(`SELECT id, nom, prenom, type, adresse, ville, tiers_sedit_id FROM ${t('contractants')} WHERE nom ILIKE $1 OR prenom ILIKE $1 OR adresse ILIKE $1 OR siren ILIKE $1 OR tiers_sedit_id ILIKE $1 ORDER BY nom LIMIT ${lim}`, [p]);
  }
  if (can(req, 'echeancier.read')) {
    out.echeances = await db.all(
      `SELECT e.id, e.contrat_id, k.numero, e.libelle, e.numero_quittance FROM ${t('echeances')} e JOIN ${t('contrats')} k ON k.id = e.contrat_id
       WHERE e.numero_quittance ILIKE $1 ORDER BY e.periode_debut DESC LIMIT ${lim}`, [p]);
  }
  res.json(out);
});

// Recherches enregistrées (REC-003) — propres à chaque utilisateur.
router.get('/enregistrees', async (req, res) => {
  res.json(await db.all(`SELECT id, libelle, requete FROM ${t('recherches_enregistrees')} WHERE username = $1 ORDER BY libelle`, [req.user.username]));
});
router.post('/enregistrees', async (req, res) => {
  if (!req.body?.libelle || !req.body?.requete) throw httpError(400, 'Libellé et requête obligatoires');
  res.status(201).json(await db.get(`INSERT INTO ${t('recherches_enregistrees')}(username, libelle, requete) VALUES ($1,$2,$3) RETURNING id, libelle, requete`, [req.user.username, req.body.libelle, req.body.requete]));
});
router.delete('/enregistrees/:id', async (req, res) => {
  await db.run(`DELETE FROM ${t('recherches_enregistrees')} WHERE id = $1 AND username = $2`, [req.params.id, req.user.username]);
  res.json({ ok: true });
});

module.exports = router;
