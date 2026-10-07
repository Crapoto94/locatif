// Contractants (CTN) : personnes physiques et morales, interlocuteurs, signataires, représentants légaux.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pageParams, orderBy, whereBuilder, like, httpError } = require('../../shared/http');
const { createRow, updateRow } = require('../../shared/crud');
const audit = require('../../services/audit');
const { config } = require('../../config');

// Lien vers la fiche du tiers dans SEDIT (nécessite l'identifiant technique ROO_IMA_REF).
const seditUrl = (roo) => (roo ? `${config.sedit.url}/${config.sedit.pageTiers}?${config.sedit.paramTiers}=${encodeURIComponent(roo)}` : null);

const FIELDS = ['type', 'nom', 'prenom', 'forme_juridique', 'siret', 'email', 'telephone', 'adresse', 'code_postal', 'ville',
  'tiers_sedit_id', 'tiers_sedit_statut', 'tiers_sedit_note', 'commentaire', 'actif'];
const SORTS = { nom: 'c.nom', ville: 'c.ville', type: 'c.type' };

router.get('/', requirePerm('contractants.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query);
  const w = whereBuilder();
  if (req.query.q) w.add(`(c.nom ILIKE ? OR c.prenom ILIKE ? OR c.siret ILIKE ? OR c.siren ILIKE ? OR c.adresse ILIKE ? OR c.tiers_sedit_id ILIKE ?)`, like(req.query.q));
  if (req.query.type) w.add('c.type = ?', req.query.type);
  if (req.query.siret) { if (req.query.siret === 'non_verifie') w.addRaw('c.siret IS NOT NULL AND c.siret_statut IS NULL'); else if (req.query.siret === 'sans') w.addRaw('c.siret IS NULL'); else w.add('c.siret_statut = ?', req.query.siret); }
  if (req.query.tiers) w.add('c.tiers_sedit_statut = ?', req.query.tiers);
  if (req.query.actif !== 'tous') w.addRaw('c.actif');
  const base = `FROM ${t('contractants')} c ${w.clause()}`;
  const total = (await db.get(`SELECT count(*)::int AS n ${base}`, w.params)).n;
  const rows = await db.all(
    `SELECT c.id, c.type, c.nom, c.prenom, c.siren, c.siret, c.siret_statut, c.siret_fermeture_le, c.siret_verifie_le, c.siret_denomination, c.email, c.telephone, c.adresse, c.code_postal, c.ville, c.tiers_sedit_id, c.tiers_sedit_statut, c.tiers_sedit_roo,
            (SELECT count(*)::int FROM ${t('contrat_contractants')} cc JOIN ${t('contrats')} k ON k.id = cc.contrat_id WHERE cc.contractant_id = c.id AND k.statut_code = 'en_cours') AS contrats_actifs,
            (SELECT count(*)::int FROM ${t('contrat_contractants')} cc WHERE cc.contractant_id = c.id) AS contrats_total,
            EXISTS (SELECT 1 FROM ${t('reprise_doublons')} d WHERE d.entite = 'contractant' AND d.statut = 'a_examiner' AND c.id IN (d.id_a, d.id_b)) AS doublon_possible
     ${base} ORDER BY ${orderBy(req.query, SORTS, 'c.nom')} LIMIT ${limit} OFFSET ${offset}`, w.params);
  res.json({ total, rows: rows.map((r) => ({ ...r, sedit_url: seditUrl(r.tiers_sedit_roo) })) });
});

router.get('/:id', requirePerm('contractants.read'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await db.get(`SELECT * FROM ${t('contractants')} WHERE id = $1`, [id]);
  if (!c) throw httpError(404, 'Contractant introuvable');
  delete c.astech_raw;
  const [contacts, contrats, biens, doublons, nbDocs] = await Promise.all([
    db.all(`SELECT * FROM ${t('contractant_contacts')} WHERE contractant_id = $1 ORDER BY nom`, [id]),
    db.all(
      `SELECT k.id, k.numero, k.type_code, k.statut_code, k.position, k.date_debut, k.date_fin, cc.role_code,
              (SELECT COALESCE(SUM(montant),0) FROM ${t('conditions_financieres')} cf WHERE cf.contrat_id = k.id AND cf.rubrique_code IN ('loyer','redevance') AND cf.date_fin IS NULL) AS loyer
       FROM ${t('contrat_contractants')} cc JOIN ${t('contrats')} k ON k.id = cc.contrat_id WHERE cc.contractant_id = $1 ORDER BY k.date_debut DESC NULLS LAST`, [id]),
    db.all(
      `SELECT DISTINCT b.id, b.designation, b.adresse, b.type_code FROM ${t('contrat_contractants')} cc
         JOIN ${t('contrat_biens')} cb ON cb.contrat_id = cc.contrat_id JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cc.contractant_id = $1`, [id]),
    db.all(
      `SELECT d.id AS doublon_id, d.motif, d.statut, o.id, o.nom FROM ${t('reprise_doublons')} d
         JOIN ${t('contractants')} o ON o.id = CASE WHEN d.id_a = $1 THEN d.id_b ELSE d.id_a END
       WHERE d.entite = 'contractant' AND $1 IN (d.id_a, d.id_b)`, [id]),
    db.get(`SELECT count(*)::int AS n FROM ${t('document_liens')} WHERE objet_type = 'contractant' AND objet_id = $1`, [id]),
  ]);
  res.json({ ...c, sedit_url: seditUrl(c.tiers_sedit_roo), contacts, contrats, biens, doublons, nb_documents: nbDocs.n });
});

router.post('/', requirePerm('contractants.write'), async (req, res) => {
  if (!req.body?.nom) throw httpError(400, 'Le nom ou la raison sociale est obligatoire');
  res.status(201).json(await createRow({ table: 'contractants', entite: 'contractant', allowed: FIELDS, body: req.body, user: req.user }));
});

router.put('/:id', requirePerm('contractants.write'), async (req, res) => {
  // Une saisie manuelle de l'identifiant tiers fait foi : le rapprochement automatique ne l'écrasera plus.
  if (req.body.tiers_sedit_id !== undefined) { const cur = await db.get(`SELECT tiers_sedit_id FROM ${t('contractants')} WHERE id = $1`, [req.params.id]); if (String(cur?.tiers_sedit_id ?? '') !== String(req.body.tiers_sedit_id ?? '')) { req.body.tiers_sedit_statut = 'manuel'; req.body.tiers_sedit_note = null; } }
  res.json(await updateRow({ table: 'contractants', entite: 'contractant', id: parseInt(req.params.id, 10), allowed: FIELDS, body: req.body, user: req.user, motif: req.body.motif }));
});

// Interlocuteurs / signataires / représentants légaux (CTN-004 à CTN-006)
const CONTACT = ['nom', 'fonction', 'email', 'telephone', 'signataire', 'representant_legal', 'type_representation'];
router.post('/:id/contacts', requirePerm('contractants.write'), async (req, res) => {
  if (!req.body?.nom) throw httpError(400, 'Le nom est obligatoire');
  const f = CONTACT.filter((k) => req.body[k] !== undefined);
  const row = await db.get(
    `INSERT INTO ${t('contractant_contacts')}(contractant_id, ${f.join(',')}) VALUES ($1, ${f.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
    [req.params.id, ...f.map((k) => req.body[k])]);
  await audit.log(req.user, 'contractant.contact_added', 'contractant', req.params.id, { details: row });
  res.status(201).json(row);
});
router.delete('/:id/contacts/:cid', requirePerm('contractants.write'), async (req, res) => {
  await db.run(`DELETE FROM ${t('contractant_contacts')} WHERE id = $1 AND contractant_id = $2`, [req.params.cid, req.params.id]);
  await audit.log(req.user, 'contractant.contact_removed', 'contractant', req.params.id, { details: { contact: req.params.cid } });
  res.json({ ok: true });
});

module.exports = router;
