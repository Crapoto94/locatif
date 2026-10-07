// Contrats (CTR) : fiche centrale — biens, contractants, conditions financières, échéancier, révisions, documents, audit.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pageParams, orderBy, whereBuilder, like, httpError } = require('../../shared/http');
const { createRow, updateRow } = require('../../shared/crud');
const audit = require('../../services/audit');
const ech = require('../echeancier/echeancier.service');

const FIELDS = ['numero', 'position', 'type_code', 'statut_code', 'objet', 'gratuit', 'date_signature', 'date_debut', 'date_fin', 'fin_evenement',
  'date_entree', 'date_sortie', 'date_debut_quittancement', 'date_cloture', 'periodicite', 'terme', 'indice_type', 'indice_reference_id',
  'date_revision_derniere', 'date_revision_prochaine', 'depot_garantie_requis', 'service_code', 'direction', 'gestionnaire', 'commentaire'];
// Corrections d'un contrat actif pour lesquelles un motif est exigé (CTR-013) — liste à confirmer avec AFLC.
const MOTIF_REQUIS = ['date_debut', 'date_fin', 'type_code', 'position', 'periodicite', 'terme', 'gratuit', 'date_entree', 'date_sortie'];
const SORTS = { numero: 'c.numero', debut: 'c.date_debut', fin: 'c.date_fin', type: 'c.type_code', statut: 'c.statut_code', loyer: 'loyer' };

const LOYER_SQL = `(SELECT COALESCE(SUM(montant),0) FROM ${t('conditions_financieres')} cf
   WHERE cf.contrat_id = c.id AND cf.rubrique_code IN ('loyer','redevance') AND (cf.date_fin IS NULL OR cf.date_fin >= CURRENT_DATE) AND (cf.date_effet IS NULL OR cf.date_effet <= CURRENT_DATE))`;

router.get('/', requirePerm('contrats.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query);
  const q = req.query; const w = whereBuilder();
  if (q.q) w.add(`(c.numero ILIKE ? OR c.objet ILIKE ? OR EXISTS (SELECT 1 FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id AND ct.nom ILIKE ?)
     OR EXISTS (SELECT 1 FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = c.id AND (b.designation ILIKE ? OR b.adresse ILIKE ?)))`, like(q.q));
  if (q.statut) w.add('c.statut_code = ?', q.statut);
  if (q.type) w.add('c.type_code = ?', q.type);
  if (q.position) w.add('c.position = ?', q.position);
  if (q.service) w.add('c.service_code = ?', q.service);
  if (q.bien) w.add(`EXISTS (SELECT 1 FROM ${t('contrat_biens')} cb WHERE cb.contrat_id = c.id AND cb.bien_id = ?)`, parseInt(q.bien, 10));
  if (q.contractant) w.add(`EXISTS (SELECT 1 FROM ${t('contrat_contractants')} cc WHERE cc.contrat_id = c.id AND cc.contractant_id = ?)`, parseInt(q.contractant, 10));
  if (q.fin_avant) w.add(`c.statut_code = 'en_cours' AND c.date_fin IS NOT NULL AND c.date_fin <= ?`, q.fin_avant);
  if (q.gratuit === 'oui') w.addRaw('c.gratuit'); else if (q.gratuit === 'non') w.addRaw('NOT c.gratuit');
  const base = `FROM ${t('contrats')} c ${w.clause()}`;
  const total = (await db.get(`SELECT count(*)::int AS n ${base}`, w.params)).n;
  const rows = await db.all(
    `SELECT c.id, c.numero, c.position, c.type_code, c.statut_code, c.gratuit, c.date_debut, c.date_fin, c.periodicite, c.date_revision_prochaine,
            ${LOYER_SQL} AS loyer,
            (SELECT json_agg(json_build_object('id', b.id, 'designation', b.designation, 'adresse', b.adresse, 'surface', b.surface))
               FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = c.id) AS biens,
            (SELECT json_agg(json_build_object('id', ct.id, 'nom', ct.nom, 'type', ct.type, 'role', cc.role_code))
               FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id) AS contractants
     ${base} ORDER BY ${orderBy(q, SORTS, 'c.numero')} LIMIT ${limit} OFFSET ${offset}`, w.params);
  res.json({ total, rows });
});

router.get('/:id', requirePerm('contrats.read'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await db.get(`SELECT * FROM ${t('contrats')} WHERE id = $1`, [id]);
  if (!c) throw httpError(404, 'Contrat introuvable');
  delete c.astech_raw;
  const [biens, contractants, conditions, echeances, revisions, depot, avenants, actes, histo, alertes, nbDocs] = await Promise.all([
    db.all(`SELECT b.id, b.designation, b.adresse, b.code_postal, b.ville, b.surface, b.type_code, b.code FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = $1`, [id]),
    db.all(`SELECT ct.id, ct.nom, ct.prenom, ct.type, ct.siren, ct.email, ct.telephone, ct.adresse, ct.code_postal, ct.ville, ct.tiers_sedit_id, cc.role_code
            FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = $1`, [id]),
    db.all(`SELECT * FROM ${t('conditions_financieres')} WHERE contrat_id = $1 ORDER BY COALESCE(date_effet,'0001-01-01') DESC, id DESC`, [id]),
    db.all(`SELECT id, libelle, periode_debut, periode_fin, date_exigibilite, montant_loyer, montant_charges, montant_total, prorata, prorata_jours, prorata_base, statut, anomalie, campagne_retiree
            FROM ${t('echeances')} WHERE contrat_id = $1 ORDER BY periode_debut DESC LIMIT 60`, [id]),
    db.all(`SELECT r.*, ip.libelle AS indice_prec, ip.valeur AS valeur_prec, inw.libelle AS indice_nouv, inw.valeur AS valeur_nouv
            FROM ${t('revisions')} r LEFT JOIN ${t('indices_valeurs')} ip ON ip.id = r.indice_prec_id LEFT JOIN ${t('indices_valeurs')} inw ON inw.id = r.indice_nouv_id
            WHERE r.contrat_id = $1 ORDER BY COALESCE(r.date_application, r.date_revision) DESC NULLS LAST`, [id]),
    db.get(`SELECT * FROM ${t('depots_garantie')} WHERE contrat_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
    db.all(`SELECT * FROM ${t('avenants')} WHERE contrat_id = $1 ORDER BY date_effet DESC NULLS LAST`, [id]),
    db.all(`SELECT * FROM ${t('actes_administratifs')} WHERE contrat_id = $1 ORDER BY date_acte DESC NULLS LAST`, [id]),
    db.all(`SELECT id, ts, utilisateur, evenement, champ, ancienne_valeur, nouvelle_valeur, motif FROM ${t('audit_log')} WHERE entite = 'contrat' AND entite_id = $1 ORDER BY ts DESC LIMIT 100`, [String(id)]),
    db.all(`SELECT id, type, titre, date_cible, statut FROM ${t('alertes')} WHERE objet_type = 'contrat' AND objet_id = $1 AND statut = 'active' ORDER BY date_cible`, [id]),
    db.get(`SELECT count(*)::int AS n FROM ${t('document_liens')} WHERE objet_type = 'contrat' AND objet_id = $1`, [id]),
  ]);
  const loyer = conditions.filter((x) => ['loyer', 'redevance'].includes(x.rubrique_code) && !x.date_fin).reduce((s, x) => s + Number(x.montant), 0);
  res.json({ ...c, biens, contractants, conditions, echeances, revisions, depot, avenants, actes, historique: histo, alertes, nb_documents: nbDocs.n, loyer_actuel: loyer });
});

async function numeroAuto(tx) {
  const an = new Date().getFullYear();
  const r = await tx.get(`SELECT count(*)::int AS n FROM ${t('contrats')} WHERE numero LIKE $1`, [`CTR-${an}-%`]);
  return `CTR-${an}-${String(r.n + 1).padStart(3, '0')}`;
}

router.post('/', requirePerm('contrats.write'), async (req, res) => {
  const b = req.body || {};
  const biens = Array.isArray(b.biens) ? b.biens : [];
  const contractants = Array.isArray(b.contractants) ? b.contractants : [];
  const row = await db.tx(async (tx) => {
    const body = { ...b, numero: b.numero || await numeroAuto(tx), statut_code: b.statut_code || 'en_cours' };
    const dup = await tx.get(`SELECT id FROM ${t('contrats')} WHERE numero = $1`, [body.numero]);
    if (dup) throw httpError(409, `Le numéro ${body.numero} existe déjà`);
    const cols = FIELDS.filter((f) => body[f] !== undefined);
    const c = await tx.get(`INSERT INTO ${t('contrats')}(${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((f) => (body[f] === '' ? null : body[f])));
    for (const bid of biens) await tx.run(`INSERT INTO ${t('contrat_biens')}(contrat_id, bien_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c.id, bid]);
    for (const ct of contractants) {
      await tx.run(`INSERT INTO ${t('contrat_contractants')}(contrat_id, contractant_id, role_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [c.id, ct.id, ct.role || 'titulaire']);
    }
    for (const cf of (b.conditions || [])) {
      await tx.run(`INSERT INTO ${t('conditions_financieres')}(contrat_id, rubrique_code, libelle, montant, quantite, tarif_unitaire, date_effet, imputation)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [c.id, cf.rubrique_code, cf.libelle || null, cf.montant || 0, cf.quantite || null, cf.tarif_unitaire || null, cf.date_effet || c.date_debut, cf.imputation || null]);
    }
    await audit.log(req.user, 'contract.created', 'contrat', c.id, { details: { numero: c.numero, biens, contractants } }, tx);
    return c;
  });
  res.status(201).json(row);
});

// Correction d'un contrat (CTR-010 à CTR-014) : ancienne valeur conservée, motif exigé pour les champs structurants.
router.put('/:id', requirePerm('contrats.write'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const avant = await db.get(`SELECT * FROM ${t('contrats')} WHERE id = $1`, [id]);
  if (!avant) throw httpError(404, 'Contrat introuvable');
  const motifRequis = avant.statut_code === 'en_cours' ? MOTIF_REQUIS : [];
  const apres = await updateRow({ table: 'contrats', entite: 'contrat', id, allowed: FIELDS, body: req.body, user: req.user, motif: req.body.motif, motifRequis });
  // CTR-014 : correction touchant une période déjà traitée financièrement => certificat administratif à la DSF.
  const touche = ['date_debut', 'date_fin', 'periodicite', 'gratuit', 'date_entree', 'date_sortie', 'terme'].some((f) => String(avant[f] ?? '') !== String(apres[f] ?? ''));
  let certificat = false;
  if (touche) {
    const n = await db.get(`SELECT count(*)::int AS n FROM ${t('echeances')} e LEFT JOIN ${t('campagnes')} ca ON ca.id = e.campagne_id
                            WHERE e.contrat_id = $1 AND (e.statut IN ('emise','mandatee') OR ca.statut = 'validee')`, [id]);
    certificat = n.n > 0;
    if (certificat) await audit.log(req.user, 'contract.certificat_requis', 'contrat', id, { motif: req.body.motif, details: { periodes_traitees: n.n } });
  }
  res.json({ ...apres, certificat_administratif_requis: certificat });
});

router.put('/:id/biens', requirePerm('contrats.write'), async (req, res) => {
  const id = parseInt(req.params.id, 10); const ids = (req.body?.biens || []).map(Number);
  await db.tx(async (tx) => {
    const avant = (await tx.all(`SELECT bien_id FROM ${t('contrat_biens')} WHERE contrat_id = $1`, [id])).map((r) => r.bien_id).sort();
    await tx.run(`DELETE FROM ${t('contrat_biens')} WHERE contrat_id = $1`, [id]);
    for (const b of ids) await tx.run(`INSERT INTO ${t('contrat_biens')}(contrat_id, bien_id) VALUES ($1,$2)`, [id, b]);
    await audit.log(req.user, 'contract.updated', 'contrat', id, { champ: 'biens', ancienne: avant.join(','), nouvelle: [...ids].sort().join(','), motif: req.body.motif }, tx);
  });
  res.json({ ok: true });
});

router.put('/:id/contractants', requirePerm('contrats.write'), async (req, res) => {
  const id = parseInt(req.params.id, 10); const list = req.body?.contractants || [];
  await db.tx(async (tx) => {
    const avant = (await tx.all(`SELECT contractant_id || ':' || role_code AS k FROM ${t('contrat_contractants')} WHERE contrat_id = $1`, [id])).map((r) => r.k).sort();
    await tx.run(`DELETE FROM ${t('contrat_contractants')} WHERE contrat_id = $1`, [id]);
    for (const c of list) await tx.run(`INSERT INTO ${t('contrat_contractants')}(contrat_id, contractant_id, role_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [id, c.id, c.role || 'titulaire']);
    await audit.log(req.user, 'contract.updated', 'contrat', id, { champ: 'contractants', ancienne: avant.join(','), nouvelle: list.map((c) => `${c.id}:${c.role || 'titulaire'}`).sort().join(','), motif: req.body.motif }, tx);
  });
  res.json({ ok: true });
});

// Conditions financières (CFI)
const CF = ['rubrique_code', 'libelle', 'montant', 'quantite', 'tarif_unitaire', 'date_effet', 'date_fin', 'imputation'];
router.post('/:id/conditions', requirePerm('contrats.write'), async (req, res) => {
  if (!req.body?.rubrique_code) throw httpError(400, 'La rubrique est obligatoire');
  const f = CF.filter((k) => req.body[k] !== undefined);
  const row = await db.tx(async (tx) => {
    const r = await tx.get(`INSERT INTO ${t('conditions_financieres')}(contrat_id, ${f.join(',')}) VALUES ($1, ${f.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
      [req.params.id, ...f.map((k) => (req.body[k] === '' ? null : req.body[k]))]);
    await audit.log(req.user, 'contract.condition_added', 'contrat', req.params.id, { details: r, motif: req.body.motif }, tx);
    return r;
  });
  res.status(201).json(row);
});
router.put('/:id/conditions/:cid', requirePerm('contrats.write'), async (req, res) => {
  const avant = await db.get(`SELECT * FROM ${t('conditions_financieres')} WHERE id = $1 AND contrat_id = $2`, [req.params.cid, req.params.id]);
  if (!avant) throw httpError(404, 'Condition introuvable');
  const f = CF.filter((k) => req.body[k] !== undefined);
  const apres = await db.get(`UPDATE ${t('conditions_financieres')} SET ${f.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.cid, ...f.map((k) => (req.body[k] === '' ? null : req.body[k]))]);
  await audit.logDiff(req.user, 'contract.condition_updated', 'contrat', req.params.id, avant, apres, f, req.body.motif);
  res.json(apres);
});
router.delete('/:id/conditions/:cid', requirePerm('contrats.write'), async (req, res) => {
  const avant = await db.get(`DELETE FROM ${t('conditions_financieres')} WHERE id = $1 AND contrat_id = $2 RETURNING *`, [req.params.cid, req.params.id]);
  if (avant) await audit.log(req.user, 'contract.condition_removed', 'contrat', req.params.id, { details: avant, motif: req.query.motif });
  res.json({ ok: true });
});

// Dépôt de garantie (DEP) : une seule ligne courante par contrat.
router.put('/:id/depot', requirePerm('contrats.write'), async (req, res) => {
  const b = req.body || {}; const id = parseInt(req.params.id, 10);
  const prev = await db.get(`SELECT * FROM ${t('depots_garantie')} WHERE contrat_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
  const vals = [b.montant || 0, b.date_versement || null, b.mode_versement || null, b.reference || null, b.date_restitution || null, b.montant_retenu || 0, b.commentaire || null];
  const row = prev
    ? await db.get(`UPDATE ${t('depots_garantie')} SET montant=$2, date_versement=$3, mode_versement=$4, reference=$5, date_restitution=$6, montant_retenu=$7, commentaire=$8 WHERE id=$1 RETURNING *`, [prev.id, ...vals])
    : await db.get(`INSERT INTO ${t('depots_garantie')}(contrat_id, montant, date_versement, mode_versement, reference, date_restitution, montant_retenu, commentaire) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [id, ...vals]);
  await audit.logDiff(req.user, 'contract.depot_updated', 'contrat', id, prev || {}, row, ['montant', 'date_versement', 'mode_versement', 'reference', 'date_restitution', 'montant_retenu'], b.motif);
  res.json(row);
});

// Clôture / résiliation (le motif est conservé) — les échéances futures non émises sont annulées.
router.post('/:id/cloturer', requirePerm('contrats.cloturer'), async (req, res) => {
  const id = parseInt(req.params.id, 10); const b = req.body || {};
  if (!b.date_cloture) throw httpError(400, 'La date de clôture est obligatoire');
  if (!b.motif) throw httpError(400, 'Le motif de clôture est obligatoire');
  const r = await db.tx(async (tx) => {
    const avant = await tx.get(`SELECT * FROM ${t('contrats')} WHERE id = $1 FOR UPDATE`, [id]);
    if (!avant) throw httpError(404, 'Contrat introuvable');
    const statut = b.statut_code || 'clos';
    await tx.run(`UPDATE ${t('contrats')} SET statut_code = $2, date_cloture = $3, date_sortie = COALESCE(date_sortie, $3), updated_at = now() WHERE id = $1`, [id, statut, b.date_cloture]);
    const annulees = await tx.run(
      `UPDATE ${t('echeances')} SET statut = 'annulee', anomalie = 'Contrat clos', updated_at = now()
       WHERE contrat_id = $1 AND statut = 'planifiee' AND periode_debut > $2`, [id, b.date_cloture]);
    await audit.log(req.user, 'contract.closed', 'contrat', id, { champ: 'statut_code', ancienne: avant.statut_code, nouvelle: statut, motif: b.motif, details: { date_cloture: b.date_cloture } }, tx);
    return { echeances_annulees: annulees.changes };
  });
  res.json({ ok: true, ...r });
});

// Avenants et actes administratifs (CTR-009 à CTR-011)
router.post('/:id/avenants', requirePerm('contrats.write'), async (req, res) => {
  const b = req.body || {};
  const r = await db.get(`INSERT INTO ${t('avenants')}(contrat_id, numero, date_effet, objet, document_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, b.numero || null, b.date_effet || null, b.objet || null, b.document_id || null]);
  await audit.log(req.user, 'contract.avenant_added', 'contrat', req.params.id, { details: r });
  res.status(201).json(r);
});
router.post('/:id/actes', requirePerm('contrats.write'), async (req, res) => {
  const b = req.body || {};
  const r = await db.get(`INSERT INTO ${t('actes_administratifs')}(contrat_id, type, reference, date_acte, objet, document_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, b.type || null, b.reference || null, b.date_acte || null, b.objet || null, b.document_id || null]);
  await audit.log(req.user, 'contract.acte_added', 'contrat', req.params.id, { details: r });
  res.status(201).json(r);
});

// Génération de l'échéancier d'un contrat jusqu'à un mois donné (AAAA-MM).
router.post('/:id/echeances/generer', requirePerm('echeancier.write'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await db.get(`SELECT * FROM ${t('contrats')} WHERE id = $1`, [id]);
  if (!c) throw httpError(404, 'Contrat introuvable');
  const from = String(c.date_debut_quittancement || c.date_entree || c.date_debut || new Date().toISOString()).slice(0, 10);
  const jusqu = req.body?.jusqu_a || ech.iso(ech.addMonths(new Date(), 12)).slice(0, 7);
  const to = `${jusqu}-28`;
  const r = await ech.generer(db, id, from, to);
  await audit.log(req.user, 'schedule.generated', 'contrat', id, { details: { jusqu_a: jusqu, ...r } });
  res.json(r);
});

module.exports = router;
