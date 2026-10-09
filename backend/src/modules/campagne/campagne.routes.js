// Campagne mensuelle (CAM) : préparation → contrôle → correction des anomalies → validation locative.
// La facturation (fichier FILIEN + pièces déposés dans un dossier) est dans modules/filien ; la suite côté SEDIT (pré-titres, statuts) reste hors périmètre (CAM-012).
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { httpError } = require('../../shared/http');
const audit = require('../../services/audit');
const ech = require('../echeancier/echeancier.service');

const periodeOk = (p) => { if (!/^\d{4}-\d{2}$/.test(p)) throw httpError(400, 'Période attendue : AAAA-MM'); return p; };
const range = (p) => ({ debut: `${p}-01`, fin: ech.iso(new Date(ech.addMonths(ech.d(`${p}-01`), 1) - 86400000)) });

async function journal(runner, campagneId, echeanceId, action, user, motif) {
  await runner.run(`INSERT INTO ${t('campagne_journal')}(campagne_id, echeance_id, action, motif, utilisateur) VALUES ($1,$2,$3,$4,$5)`, [campagneId, echeanceId || null, action, motif || null, user.username]);
}

async function getOrCreate(periode, user) {
  return (await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periode]))
    || (await db.get(`INSERT INTO ${t('campagnes')}(periode, prepare_par) VALUES ($1,$2) RETURNING *`, [periode, user.username]));
}

async function resume(c) {
  const s = await db.get(
    `SELECT count(*) FILTER (WHERE NOT campagne_retiree)::int AS nb, count(*) FILTER (WHERE campagne_retiree)::int AS retirees,
            COALESCE(SUM(montant_loyer) FILTER (WHERE NOT campagne_retiree),0) AS loyers, COALESCE(SUM(montant_charges) FILTER (WHERE NOT campagne_retiree),0) AS charges,
            COALESCE(SUM(montant_total) FILTER (WHERE NOT campagne_retiree),0) AS total,
            count(*) FILTER (WHERE anomalie IS NOT NULL AND NOT campagne_retiree)::int AS anomalies,
            count(*) FILTER (WHERE anomalie LIKE 'BLOQUANT%' AND NOT campagne_retiree)::int AS bloquantes
     FROM ${t('echeances')} WHERE campagne_id = $1`, [c.id]);
  return { ...c, ...s, taux_conformite: s.nb ? Math.round(((s.nb - s.anomalies) / s.nb) * 1000) / 10 : 100 };
}

router.get('/', requirePerm('campagne.read'), async (req, res) => {
  const rows = await db.all(`SELECT * FROM ${t('campagnes')} ORDER BY periode DESC LIMIT 36`);
  res.json(await Promise.all(rows.map(resume)));
});

router.get('/:periode', requirePerm('campagne.read'), async (req, res) => {
  const periode = periodeOk(req.params.periode);
  const c = await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periode]);
  if (!c) return res.json({ periode, statut: 'non_preparee' });
  res.json({ ...(await resume(c)), filien: c.filien_export_id ? await db.get(`SELECT id, nom, dossier, fichier, nb_mouvements, nb_pj, total, premier_mouvement, dernier_mouvement, genere_par, genere_le FROM ${t('filien_exports')} WHERE id = $1`, [c.filien_export_id]) : null, journal: await db.all(`SELECT * FROM ${t('campagne_journal')} WHERE campagne_id = $1 ORDER BY ts DESC LIMIT 100`, [c.id]) });
});

// Lignes : loyer, charges, période, contractant, adresse du bien (CAM-009/010).
router.get('/:periode/lignes', requirePerm('campagne.read'), async (req, res) => {
  const c = await db.get(`SELECT id FROM ${t('campagnes')} WHERE periode = $1`, [periodeOk(req.params.periode)]);
  if (!c) return res.json([]);
  res.json(await db.all(
    `SELECT e.id, e.contrat_id, k.numero AS contrat_numero, e.libelle, e.periode_debut, e.periode_fin, e.montant_loyer, e.montant_charges, e.montant_total,
            e.prorata, e.prorata_jours, e.anomalie, e.campagne_retiree, e.statut,
            (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = k.id) AS contractant,
            (SELECT string_agg(ct.adresse || COALESCE(' ' || ct.code_postal,'') || COALESCE(' ' || ct.ville,''), ' ; ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = k.id AND ct.adresse IS NOT NULL) AS adresse_contractant,
            (SELECT string_agg(b.designation || COALESCE(' — ' || b.adresse,''), ' ; ') FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = k.id) AS bien
     FROM ${t('echeances')} e JOIN ${t('contrats')} k ON k.id = e.contrat_id WHERE e.campagne_id = $1
     ${req.query.anomalies === 'oui' ? 'AND e.anomalie IS NOT NULL' : ''} ORDER BY (e.anomalie IS NULL), k.numero`, [c.id]));
});

// Préparation (AFLC) : génère les échéances manquantes du mois puis les rattache à la campagne.
router.post('/:periode/preparer', requirePerm('campagne.write'), async (req, res) => {
  const periode = periodeOk(req.params.periode); const r = range(periode);
  const c = await getOrCreate(periode, req.user);
  if (c.statut === 'validee') throw httpError(409, 'Campagne déjà validée');
  const contrats = await db.all(`SELECT id FROM ${t('contrats')} WHERE statut_code = 'en_cours' AND NOT gratuit`);
  let crees = 0;
  for (const k of contrats) crees += (await ech.generer(db, k.id, r.debut, r.fin)).crees;
  const rattachees = await db.run(
    `UPDATE ${t('echeances')} SET campagne_id = $1, updated_at = now()
     WHERE periode_debut >= $2 AND periode_debut <= $3 AND statut <> 'annulee' AND campagne_id IS NULL`, [c.id, r.debut, r.fin]);
  await db.run(`UPDATE ${t('campagnes')} SET statut = CASE WHEN statut = 'preparation' THEN 'preparation' ELSE statut END, prepare_par = $2 WHERE id = $1`, [c.id, req.user.username]);
  await journal(db, c.id, null, 'ajout', req.user, `${crees} échéance(s) générée(s), ${rattachees.changes} rattachée(s)`);
  await audit.log(req.user, 'campaign.prepared', 'campagne', c.id, { details: { periode, crees, rattachees: rattachees.changes } });
  res.json(await resume(await db.get(`SELECT * FROM ${t('campagnes')} WHERE id = $1`, [c.id])));
});

// Contrôles : les anomalies sont reliées à l'échéance et au contrat d'origine (CAM-ERR-001).
// CONVENTION : BLOQUANT = erreur technique (donnée manquante rendant l'échéance inexploitable) ; la liste exhaustive reste à valider (CAM-005).
router.post('/:periode/controler', requirePerm('campagne.write'), async (req, res) => {
  const periode = periodeOk(req.params.periode);
  const c = await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periode]);
  if (!c) throw httpError(404, 'Campagne non préparée');
  if (c.statut === 'validee') throw httpError(409, 'Campagne déjà validée');
  await db.run(`UPDATE ${t('echeances')} SET anomalie = NULL WHERE campagne_id = $1 AND NOT campagne_retiree`, [c.id]);
  const regles = [
    ['BLOQUANT : aucun contractant rattaché au contrat', `NOT EXISTS (SELECT 1 FROM ${t('contrat_contractants')} cc WHERE cc.contrat_id = e.contrat_id)`],
    ['BLOQUANT : aucun bien rattaché au contrat', `NOT EXISTS (SELECT 1 FROM ${t('contrat_biens')} cb WHERE cb.contrat_id = e.contrat_id)`],
    ['BLOQUANT : montant total nul ou négatif', `e.montant_total <= 0`],
    ['Indice de révision échu non appliqué', `k.date_revision_prochaine IS NOT NULL AND k.date_revision_prochaine < e.periode_debut`],
    ['Contrat expiré avant la période', `k.date_fin IS NOT NULL AND k.date_fin < e.periode_debut AND k.statut_code = 'en_cours'`],
    ['Échéance en doublon sur la période', `(SELECT count(*) FROM ${t('echeances')} x WHERE x.contrat_id = e.contrat_id AND x.periode_debut = e.periode_debut AND x.statut <> 'annulee') > 1`],
  ];
  for (const [msg, cond] of regles) {
    await db.run(
      `UPDATE ${t('echeances')} e SET anomalie = CASE WHEN e.anomalie IS NULL THEN $2 ELSE e.anomalie || ' | ' || $2 END
       FROM ${t('contrats')} k WHERE k.id = e.contrat_id AND e.campagne_id = $1 AND NOT e.campagne_retiree AND (${cond})`, [c.id, msg]);
  }
  const r = await resume(c);
  const statut = r.anomalies ? 'correction' : 'controle';
  await db.run(`UPDATE ${t('campagnes')} SET statut = $2, controle_par = $3 WHERE id = $1`, [c.id, statut, req.user.username]);
  await journal(db, c.id, null, 'controle', req.user, `${r.anomalies} anomalie(s), dont ${r.bloquantes} bloquante(s)`);
  await audit.log(req.user, 'campaign.controlled', 'campagne', c.id, { details: { anomalies: r.anomalies, bloquantes: r.bloquantes } });
  res.json({ ...r, statut });
});

// Retrait / reprise d'une échéance (CAM-007/008) — traçable.
router.post('/:periode/echeances/:eid/retirer', requirePerm('campagne.write'), async (req, res) => {
  const c = await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periodeOk(req.params.periode)]);
  if (!c || c.statut === 'validee') throw httpError(409, 'Campagne introuvable ou déjà validée');
  if (!req.body?.motif) throw httpError(400, 'Le motif du retrait est obligatoire');
  const r = await db.run(`UPDATE ${t('echeances')} SET campagne_retiree = TRUE, updated_at = now() WHERE id = $1 AND campagne_id = $2`, [req.params.eid, c.id]);
  if (!r.changes) throw httpError(404, 'Échéance absente de cette campagne');
  await journal(db, c.id, req.params.eid, 'retrait', req.user, req.body.motif);
  await audit.log(req.user, 'campaign.echeance_removed', 'echeance', req.params.eid, { motif: req.body.motif, details: { campagne: c.periode } });
  res.json({ ok: true });
});
router.post('/:periode/echeances/:eid/reprendre', requirePerm('campagne.write'), async (req, res) => {
  const c = await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periodeOk(req.params.periode)]);
  if (!c || c.statut === 'validee') throw httpError(409, 'Campagne introuvable ou déjà validée');
  await db.run(`UPDATE ${t('echeances')} SET campagne_retiree = FALSE, updated_at = now() WHERE id = $1 AND campagne_id = $2`, [req.params.eid, c.id]);
  await journal(db, c.id, req.params.eid, 'reprise', req.user, req.body?.motif);
  await audit.log(req.user, 'campaign.echeance_restored', 'echeance', req.params.eid, { motif: req.body?.motif, details: { campagne: c.periode } });
  res.json({ ok: true });
});

// Validation locative : refusée tant qu'une anomalie bloquante subsiste. Une même personne peut tenir les trois rôles (CAM-004).
router.post('/:periode/valider', requirePerm('campagne.valider'), async (req, res) => {
  const c = await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periodeOk(req.params.periode)]);
  if (!c) throw httpError(404, 'Campagne non préparée');
  if (c.statut === 'validee') throw httpError(409, 'Campagne déjà validée');
  const r = await resume(c);
  if (r.bloquantes) throw httpError(409, `${r.bloquantes} anomalie(s) bloquante(s) à corriger ou à retirer avant validation`);
  await db.run(`UPDATE ${t('campagnes')} SET statut = 'validee', validee_par = $2, validee_le = now() WHERE id = $1`, [c.id, req.user.username]);
  await journal(db, c.id, null, 'validation', req.user, `Validation locative — ${r.nb} échéance(s), ${r.total} €`);
  await audit.log(req.user, 'campaign.validated', 'campagne', c.id, { details: { periode: c.periode, nb: r.nb, total: r.total } });
  res.json(await resume(await db.get(`SELECT * FROM ${t('campagnes')} WHERE id = $1`, [c.id])));
});

module.exports = router;
