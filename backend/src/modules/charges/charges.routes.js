// Charges locatives (CHG) : provisions, dépenses réelles (saisie manuelle), clés de répartition, prorata d'occupation, régularisation annuelle.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { httpError, whereBuilder } = require('../../shared/http');
const audit = require('../../services/audit');
const { round2, daysBetween, d } = require('../echeancier/echeancier.service');

const FIELDS = ['bien_id', 'contrat_id', 'annee', 'nature', 'libelle', 'montant', 'cle_repartition', 'valeur_cle', 'total_cle'];
const CLES = ['tantiemes', 'surface', 'pourcentage', 'montant_fixe'];

router.get('/', requirePerm('charges.read'), async (req, res) => {
  const w = whereBuilder();
  if (req.query.annee) w.add('ch.annee = ?', parseInt(req.query.annee, 10));
  if (req.query.contrat) w.add('ch.contrat_id = ?', parseInt(req.query.contrat, 10));
  if (req.query.bien) w.add('ch.bien_id = ?', parseInt(req.query.bien, 10));
  res.json(await db.all(
    `SELECT ch.*, b.designation AS bien, k.numero AS contrat_numero FROM ${t('charges')} ch
       LEFT JOIN ${t('biens')} b ON b.id = ch.bien_id LEFT JOIN ${t('contrats')} k ON k.id = ch.contrat_id ${w.clause()} ORDER BY ch.annee DESC, ch.id DESC LIMIT 500`, w.params));
});

function check(b) {
  if (!b.annee || !b.libelle) throw httpError(400, 'Année et libellé obligatoires');
  if (!b.bien_id && !b.contrat_id) throw httpError(400, 'Rattacher la charge à un bien/bâtiment ou à un contrat');
  if (b.cle_repartition && !CLES.includes(b.cle_repartition)) throw httpError(400, 'Clé de répartition inconnue');
}

router.post('/', requirePerm('charges.write'), async (req, res) => {
  check(req.body);
  const f = FIELDS.filter((k) => req.body[k] !== undefined && req.body[k] !== '');
  const row = await db.get(`INSERT INTO ${t('charges')}(${f.join(',')}) VALUES (${f.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, f.map((k) => req.body[k]));
  await audit.log(req.user, 'charge.created', 'charge', row.id, { details: row });
  res.status(201).json(row);
});

router.put('/:id', requirePerm('charges.write'), async (req, res) => {
  const avant = await db.get(`SELECT * FROM ${t('charges')} WHERE id = $1`, [req.params.id]);
  if (!avant) throw httpError(404, 'Charge introuvable');
  const f = FIELDS.filter((k) => req.body[k] !== undefined);
  const apres = await db.get(`UPDATE ${t('charges')} SET ${f.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [avant.id, ...f.map((k) => (req.body[k] === '' ? null : req.body[k]))]);
  await audit.logDiff(req.user, 'charge.updated', 'charge', avant.id, avant, apres, f, req.body.motif);
  res.json(apres);
});

router.delete('/:id', requirePerm('charges.write'), async (req, res) => {
  const avant = await db.get(`DELETE FROM ${t('charges')} WHERE id = $1 RETURNING *`, [req.params.id]);
  if (avant) await audit.log(req.user, 'charge.deleted', 'charge', avant.id, { details: avant });
  res.json({ ok: true });
});

// Part d'une dépense pour un contrat selon la clé de répartition.
function part(ch, surfaceContrat) {
  const m = Number(ch.montant);
  switch (ch.cle_repartition) {
    case 'pourcentage': return m * (Number(ch.valeur_cle || 0) / 100);
    case 'tantiemes': return ch.total_cle ? m * (Number(ch.valeur_cle || 0) / Number(ch.total_cle)) : 0;
    case 'surface': return ch.total_cle ? m * ((Number(ch.valeur_cle) || surfaceContrat) / Number(ch.total_cle)) : 0;
    default: return Number(ch.valeur_cle ?? m); // montant_fixe : le montant attribué au contrat
  }
}

// Calcul d'une régularisation (sans écriture) : provisions appelées vs quote-part des dépenses réelles × prorata d'occupation.
async function calculer(contratId, annee) {
  const k = await db.get(`SELECT * FROM ${t('contrats')} WHERE id = $1`, [contratId]);
  if (!k) throw httpError(404, 'Contrat introuvable');
  const biens = await db.all(`SELECT b.id, b.parent_id, b.surface FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = $1`, [contratId]);
  const niveaux = [...new Set(biens.flatMap((b) => [b.id, b.parent_id]).filter(Boolean))];
  const surface = biens.reduce((s, b) => s + Number(b.surface || 0), 0);
  const lignes = await db.all(
    `SELECT * FROM ${t('charges')} WHERE annee = $1 AND nature = 'reel' AND (contrat_id = $2 OR (contrat_id IS NULL AND bien_id = ANY($3)))`, [annee, contratId, niveaux]);
  const provisions = await db.get(
    `SELECT COALESCE(SUM(montant_charges),0) AS s FROM ${t('echeances')} WHERE contrat_id = $1 AND statut <> 'annulee' AND EXTRACT(YEAR FROM periode_debut) = $2`, [contratId, annee]);
  // Prorata d'occupation sur l'année (CHG-008)
  const debAn = `${annee}-01-01`; const finAn = `${annee}-12-31`;
  const entree = String(k.date_entree || k.date_debut || debAn).slice(0, 10); const sortie = String(k.date_sortie || k.date_cloture || k.date_fin || finAn).slice(0, 10);
  const de = entree > debAn ? entree : debAn; const fi = sortie < finAn ? sortie : finAn;
  const jours = de <= fi ? daysBetween(d(de), d(fi)) : 0; const baseJours = daysBetween(d(debAn), d(finAn));
  const coef = jours / baseJours;
  const detail = lignes.map((ch) => ({ id: ch.id, libelle: ch.libelle, montant: Number(ch.montant), cle: ch.cle_repartition, valeur_cle: ch.valeur_cle, total_cle: ch.total_cle, quote_part: round2(part(ch, surface) * coef) }));
  const reelles = round2(detail.reduce((s, x) => s + x.quote_part, 0));
  return {
    contrat_id: contratId, numero: k.numero, annee, provisions_appelees: round2(provisions.s), charges_reelles: reelles,
    prorata_jours: jours, prorata_base: baseJours, solde: round2(reelles - Number(provisions.s)), detail,
  };
}

router.get('/regularisation/calculer', requirePerm('charges.read'), async (req, res) => {
  res.json(await calculer(parseInt(req.query.contrat_id, 10), parseInt(req.query.annee, 10)));
});

router.get('/regularisations', requirePerm('charges.read'), async (req, res) => {
  res.json(await db.all(`SELECT r.*, k.numero FROM ${t('regularisations')} r JOIN ${t('contrats')} k ON k.id = r.contrat_id ORDER BY r.annee DESC, k.numero LIMIT 300`));
});

router.post('/regularisation', requirePerm('charges.write'), async (req, res) => {
  const { contrat_id, annee, statut } = req.body || {};
  const c = await calculer(contrat_id, annee);
  const prev = await db.get(`SELECT * FROM ${t('regularisations')} WHERE contrat_id = $1 AND annee = $2`, [contrat_id, annee]);
  if (prev?.statut === 'validee') throw httpError(409, 'Régularisation déjà validée pour cette année');
  const row = await db.get(
    `INSERT INTO ${t('regularisations')}(contrat_id, annee, provisions_appelees, charges_reelles, prorata_jours, solde, statut, detail, utilisateur)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (contrat_id, annee) DO UPDATE SET provisions_appelees=$3, charges_reelles=$4, prorata_jours=$5, solde=$6, statut=$7, detail=$8, utilisateur=$9 RETURNING *`,
    [contrat_id, annee, c.provisions_appelees, c.charges_reelles, c.prorata_jours, c.solde, statut === 'validee' ? 'validee' : 'brouillon', JSON.stringify(c.detail), req.user.username]);
  await audit.log(req.user, statut === 'validee' ? 'charge.regularisation_validated' : 'charge.regularisation_saved', 'contrat', contrat_id, { details: { annee, solde: c.solde } });
  res.status(201).json(row);
});

module.exports = { router, calculerRegularisation: calculer };
