// Échéancier (ECH) : le mois est l'axe central de consultation (ECH-004). Notion distincte de la compta / du titre.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pageParams, whereBuilder, like, httpError } = require('../../shared/http');
const audit = require('../../services/audit');
const ech = require('./echeancier.service');

const monthRange = (periode) => {
  if (!/^\d{4}-\d{2}$/.test(periode || '')) throw httpError(400, 'Période attendue : AAAA-MM');
  const debut = `${periode}-01`; const fin = ech.iso(new Date(ech.addMonths(ech.d(debut), 1) - 86400000));
  return { debut, fin };
};

const SELECT = `SELECT e.id, e.contrat_id, c.numero AS contrat_numero, c.type_code, e.libelle, e.periode_debut, e.periode_fin, e.date_exigibilite,
  e.montant_loyer, e.montant_charges, e.montant_total, e.prorata, e.prorata_jours, e.prorata_base, e.statut, e.anomalie, e.numero_quittance,
  e.date_quittance, e.campagne_id, e.campagne_retiree, e.titre_numero, e.titre_exercice, e.titre_date, e.titre_bordereau, e.titre_roo, e.titre_confiance, e.titre_etat, e.titre_paiement_le, e.titre_prise_en_charge_le,
  (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id) AS contractants,
  (SELECT string_agg(COALESCE(b.designation,'') || CASE WHEN b.adresse IS NOT NULL THEN ' — ' || b.adresse ELSE '' END, ' ; ') FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = c.id) AS biens
  FROM ${t('echeances')} e JOIN ${t('contrats')} c ON c.id = e.contrat_id`;

router.get('/', requirePerm('echeancier.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query, { def: 50, max: 500 });
  const w = whereBuilder();
  if (req.query.periode) { const r = monthRange(req.query.periode); w.add('e.periode_debut >= ?', r.debut); w.add('e.periode_debut <= ?', r.fin); }
  if (req.query.du) w.add('e.periode_debut >= ?', req.query.du);
  if (req.query.au) w.add('e.periode_debut <= ?', req.query.au);
  if (req.query.statut) w.add('e.statut = ?', req.query.statut);
  if (req.query.contrat) w.add('e.contrat_id = ?', parseInt(req.query.contrat, 10));
  if (req.query.prorata === 'oui') w.addRaw('e.prorata');
  // Paiement du titre : paye | non_paye (titré mais ni payé ni rejeté) | rejete
  if (req.query.paiement === 'paye') w.addRaw("e.titre_etat = 'paye'");
  else if (req.query.paiement === 'non_paye') w.addRaw("e.titre_etat IN ('a_payer','non_pris_en_charge','suspendu')"); // titres retrouvés dans SEDIT et pas (encore) payés
  else if (req.query.paiement === 'rejete') w.addRaw("e.titre_etat = 'rejete'");
  if (req.query.anomalie === 'oui') w.addRaw('e.anomalie IS NOT NULL');
  if (req.query.q) w.add(`(c.numero ILIKE ? OR EXISTS (SELECT 1 FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id AND ct.nom ILIKE ?))`, like(req.query.q));
  const where = w.clause().replace(/\be\./g, 'e.').replace(/\bc\./g, 'c.');
  const base = `FROM ${t('echeances')} e JOIN ${t('contrats')} c ON c.id = e.contrat_id ${where}`;
  const tot = await db.get(`SELECT count(*)::int AS n, COALESCE(SUM(e.montant_loyer),0) AS loyers, COALESCE(SUM(e.montant_charges),0) AS charges, COALESCE(SUM(e.montant_total),0) AS total ${base}`, w.params);
  const rows = await db.all(`${SELECT} ${where} ORDER BY e.periode_debut, c.numero LIMIT ${limit} OFFSET ${offset}`, w.params);
  const { config } = require('../../config');
  const lien = (r) => (r.titre_roo ? `${config.sedit.url}/${config.sedit.pageMandat}?${config.sedit.paramMandat}=${encodeURIComponent(r.titre_roo)}` : null);
  res.json({ total: tot.n, totaux: { loyers: tot.loyers, charges: tot.charges, total: tot.total }, rows: rows.map((r) => ({ ...r, titre_url: lien(r) })) });
});

// Totaux par mois sur une année (vue calendaire).
router.get('/mois', requirePerm('echeancier.read'), async (req, res) => {
  const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
  res.json(await db.all(
    `SELECT to_char(periode_debut, 'YYYY-MM') AS periode, count(*)::int AS nb, SUM(montant_loyer) AS loyers, SUM(montant_charges) AS charges, SUM(montant_total) AS total,
            count(*) FILTER (WHERE prorata)::int AS nb_prorata, count(*) FILTER (WHERE anomalie IS NOT NULL)::int AS nb_anomalies
     FROM ${t('echeances')} WHERE statut <> 'annulee' AND EXTRACT(YEAR FROM periode_debut) = $1 GROUP BY 1 ORDER BY 1`, [annee]));
});

// Génère les échéances manquantes d'un mois pour tous les contrats en cours (préparation de campagne).
router.post('/generer-mois', requirePerm('echeancier.write'), async (req, res) => {
  const r = monthRange(req.body?.periode);
  const contrats = await db.all(`SELECT id FROM ${t('contrats')} WHERE statut_code = 'en_cours' AND NOT gratuit`);
  let crees = 0;
  for (const c of contrats) crees += (await ech.generer(db, c.id, r.debut, r.fin)).crees;
  await audit.log(req.user, 'schedule.generated', 'echeancier', req.body.periode, { details: { contrats: contrats.length, crees } });
  res.json({ contrats: contrats.length, crees });
});

// Ajustement manuel d'une échéance (audité, motif exigé).
router.put('/:id', requirePerm('echeancier.write'), async (req, res) => {
  const b = req.body || {};
  if (!b.motif) throw httpError(400, 'Un motif est requis pour modifier une échéance');
  const avant = await db.get(`SELECT * FROM ${t('echeances')} WHERE id = $1`, [req.params.id]);
  if (!avant) throw httpError(404, 'Échéance introuvable');
  if (['emise', 'titree'].includes(avant.statut)) throw httpError(409, 'Échéance déjà émise : un certificat administratif DSF est nécessaire (CTR-014)');
  const loyer = b.montant_loyer ?? avant.montant_loyer; const charges = b.montant_charges ?? avant.montant_charges;
  const apres = await db.get(
    `UPDATE ${t('echeances')} SET montant_loyer=$2, montant_charges=$3, montant_total=$4, date_exigibilite=COALESCE($5,date_exigibilite), statut=COALESCE($6,statut), updated_at=now() WHERE id=$1 RETURNING *`,
    [avant.id, loyer, charges, ech.round2(Number(loyer) + Number(charges)), b.date_exigibilite || null, b.statut || null]);
  await audit.logDiff(req.user, 'schedule.updated', 'echeance', avant.id, avant, apres, ['montant_loyer', 'montant_charges', 'date_exigibilite', 'statut'], b.motif);
  res.json(apres);
});

module.exports = router;
