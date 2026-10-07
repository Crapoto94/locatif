// Référentiels métier administrables (REF) : jamais de suppression d'une valeur, seulement une désactivation (REF-005).
const router = require('express').Router();
const { db, t } = require('../../db');
const { authenticate, requirePerm } = require('../../middleware/auth');
const { httpError } = require('../../shared/http');
const audit = require('../../services/audit');

const LIBELLES = {
  type_bien: 'Types de bien', statut_occupation: "Statuts d'occupation", disponibilite: 'Disponibilité', motif_indisponibilite: "Motifs d'indisponibilité",
  type_contrat: 'Types de contrat', statut_contrat: 'Statuts de contrat', role_contractant: 'Rôles des contractants', rubrique: 'Rubriques financières',
  type_document: 'Types de document', type_indice: "Types d'indice",
};

// Lecture ouverte à tout utilisateur connecté : les formulaires en ont besoin.
router.get('/toutes', authenticate, async (req, res) => {
  const rows = await db.all(`SELECT domaine, code, libelle, meta FROM ${t('ref_valeurs')} WHERE actif ORDER BY domaine, ordre, libelle`);
  const out = {};
  for (const r of rows) (out[r.domaine] ||= []).push({ code: r.code, libelle: r.libelle, meta: r.meta });
  res.json(out);
});

router.get('/domaines', requirePerm('referentiels.read'), async (req, res) => {
  const counts = await db.all(`SELECT domaine, count(*)::int AS n, count(*) FILTER (WHERE actif)::int AS actifs FROM ${t('ref_valeurs')} GROUP BY 1`);
  res.json(counts.map((c) => ({ ...c, libelle: LIBELLES[c.domaine] || c.domaine })).sort((a, b) => a.libelle.localeCompare(b.libelle)));
});

// Utilisation de chaque valeur (pour éclairer la désactivation).
const USAGE = {
  type_bien: ['biens', 'type_code'], statut_occupation: ['biens', 'statut_occupation'], disponibilite: ['biens', 'disponibilite'], motif_indisponibilite: ['biens', 'motif_indisponibilite'],
  type_contrat: ['contrats', 'type_code'], statut_contrat: ['contrats', 'statut_code'], role_contractant: ['contrat_contractants', 'role_code'],
  rubrique: ['conditions_financieres', 'rubrique_code'], type_document: ['documents', 'type_code'], type_indice: ['indices_valeurs', 'type_code'],
};

router.get('/:domaine', requirePerm('referentiels.read'), async (req, res) => {
  const u = USAGE[req.params.domaine];
  const usage = u ? Object.fromEntries((await db.all(`SELECT ${u[1]} AS code, count(*)::int AS n FROM ${t(u[0])} GROUP BY 1`)).map((r) => [r.code, r.n])) : {};
  const rows = await db.all(`SELECT * FROM ${t('ref_valeurs')} WHERE domaine = $1 ORDER BY ordre, libelle`, [req.params.domaine]);
  res.json(rows.map((r) => ({ ...r, utilisations: usage[r.code] || 0 })));
});

router.post('/:domaine', requirePerm('referentiels.write'), async (req, res) => {
  const { code, libelle, ordre, meta } = req.body || {};
  if (!code || !libelle) throw httpError(400, 'Code et libellé obligatoires');
  if (!/^[a-z0-9_]+$/i.test(code)) throw httpError(400, 'Code : lettres, chiffres et _ uniquement');
  const row = await db.get(
    `INSERT INTO ${t('ref_valeurs')}(domaine, code, libelle, ordre, meta, origine) VALUES ($1,$2,$3,COALESCE($4,999),$5,'manuel') ON CONFLICT (domaine, code) DO NOTHING RETURNING *`,
    [req.params.domaine, code, libelle, ordre ?? null, JSON.stringify(meta || {})]);
  if (!row) throw httpError(409, 'Ce code existe déjà');
  await audit.log(req.user, 'referentiel.created', 'referentiel', `${req.params.domaine}/${code}`, { details: row });
  res.status(201).json(row);
});

router.put('/:domaine/:id', requirePerm('referentiels.write'), async (req, res) => {
  const avant = await db.get(`SELECT * FROM ${t('ref_valeurs')} WHERE id = $1 AND domaine = $2`, [req.params.id, req.params.domaine]);
  if (!avant) throw httpError(404, 'Valeur introuvable');
  const b = req.body || {};
  const apres = await db.get(
    `UPDATE ${t('ref_valeurs')} SET libelle = COALESCE($2, libelle), ordre = COALESCE($3, ordre), actif = COALESCE($4, actif), meta = COALESCE($5, meta) WHERE id = $1 RETURNING *`,
    [avant.id, b.libelle ?? null, b.ordre ?? null, b.actif ?? null, b.meta ? JSON.stringify(b.meta) : null]);
  await audit.logDiff(req.user, 'referentiel.updated', 'referentiel', `${avant.domaine}/${avant.code}`, avant, apres, ['libelle', 'ordre', 'actif'], b.motif);
  res.json(apres);
});

module.exports = router;
