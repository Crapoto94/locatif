// Biens (BIE) : site/ensemble → bâtiment → unité locative, ou bien isolé (BIE-002/003).
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pageParams, orderBy, whereBuilder, like, httpError } = require('../../shared/http');
const { createRow, updateRow } = require('../../shared/crud');
const geocodage = require('./geocodage');

const FIELDS = ['parent_id', 'niveau', 'code', 'designation', 'type_code', 'categorie', 'adresse', 'code_postal', 'ville', 'surface',
  'reference_cadastrale', 'statut_occupation', 'disponibilite', 'motif_indisponibilite', 'service_code', 'direction', 'gestionnaire',
  'hub_site_id', 'latitude', 'longitude', 'geoloc_source', 'commentaire', 'actif'];
const SORTS = { designation: 'b.designation', code: 'b.code', adresse: 'b.adresse', surface: 'b.surface', type: 'b.type_code' };

router.get('/', requirePerm('biens.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query);
  const w = whereBuilder();
  if (req.query.q) w.add(`(b.designation ILIKE ? OR b.code ILIKE ? OR b.adresse ILIKE ? OR b.reference_cadastrale ILIKE ?)`.replace(/\?/g, '?'), like(req.query.q));
  if (req.query.type) w.add('b.type_code = ?', req.query.type);
  if (req.query.niveau) w.add('b.niveau = ?', req.query.niveau);
  if (req.query.service) w.add('b.service_code = ?', req.query.service);
  if (req.query.statut) w.add('b.statut_occupation = ?', req.query.statut);
  if (req.query.actif !== 'tous') w.addRaw('b.actif');
  const base = `FROM ${t('biens')} b ${w.clause()}`;
  const total = (await db.get(`SELECT count(*)::int AS n ${base}`, w.params)).n;
  const rows = await db.all(
    `SELECT b.id, b.code, b.designation, b.niveau, b.type_code, b.categorie, b.adresse, b.code_postal, b.ville, b.surface,
            b.statut_occupation, b.disponibilite, b.service_code, b.direction, b.astech_id, b.latitude, b.longitude,
            (SELECT c.numero FROM ${t('contrat_biens')} cb JOIN ${t('contrats')} c ON c.id = cb.contrat_id
              WHERE cb.bien_id = b.id AND c.statut_code = 'en_cours' ORDER BY c.date_debut DESC NULLS LAST LIMIT 1) AS contrat_numero,
            (SELECT c.id FROM ${t('contrat_biens')} cb JOIN ${t('contrats')} c ON c.id = cb.contrat_id
              WHERE cb.bien_id = b.id AND c.statut_code = 'en_cours' ORDER BY c.date_debut DESC NULLS LAST LIMIT 1) AS contrat_id,
            (SELECT string_agg(DISTINCT ct.nom, ', ') FROM ${t('contrat_biens')} cb JOIN ${t('contrats')} c ON c.id = cb.contrat_id AND c.statut_code = 'en_cours'
               JOIN ${t('contrat_contractants')} cc ON cc.contrat_id = c.id JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id
              WHERE cb.bien_id = b.id) AS occupant
     ${base} ORDER BY ${orderBy(req.query, SORTS, 'b.designation')} LIMIT ${limit} OFFSET ${offset}`, w.params);
  res.json({ total, rows });
});

// Historique d'occupation / vacance (BIE-007) : saisies manuelles + périodes déduites des contrats.
function buildHistorique(manuels, contrats) {
  const occ = [
    ...manuels.filter((m) => m.type === 'occupation').map((m) => ({ ...m, origine: 'saisie' })),
    ...contrats.filter((c) => c.date_debut_occ).map((c) => ({
      id: `c${c.id}`, type: 'occupation', contrat_id: c.id, contrat_numero: c.numero, contractants: c.contractants,
      date_debut: c.date_debut_occ, date_fin: c.date_fin_occ, origine: 'contrat',
    })),
  ].sort((a, b) => String(a.date_debut).localeCompare(String(b.date_debut)));
  const vacances = manuels.filter((m) => m.type === 'vacance').map((m) => ({ ...m, origine: 'saisie' }));
  for (let i = 1; i < occ.length; i++) { // vacance déduite entre deux occupations successives
    const fin = occ[i - 1].date_fin; const deb = occ[i].date_debut;
    if (fin && deb && fin < deb) vacances.push({ id: `v${i}`, type: 'vacance', date_debut: fin, date_fin: deb, origine: 'deduite' });
  }
  return [...occ, ...vacances].sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)));
}

// Cartographie : unités locatives positionnées, avec occupant et loyer du contrat en cours (infobulle).
router.get('/carte', requirePerm('biens.read'), async (req, res) => {
  const rows = await db.all(
    `SELECT b.id, b.designation, b.code, b.adresse, b.code_postal, b.ville, b.type_code, b.statut_occupation, b.disponibilite, b.surface, b.latitude, b.longitude,
            k.id AS contrat_id, k.numero AS contrat_numero, k.date_fin,
            (SELECT string_agg(DISTINCT ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = k.id) AS occupant,
            (SELECT COALESCE(SUM(montant),0) FROM ${t('conditions_financieres')} cf WHERE cf.contrat_id = k.id AND cf.rubrique_code IN ('loyer','redevance') AND cf.date_fin IS NULL) AS loyer
     FROM ${t('biens')} b
     LEFT JOIN LATERAL (SELECT c.* FROM ${t('contrat_biens')} cb JOIN ${t('contrats')} c ON c.id = cb.contrat_id
                        WHERE cb.bien_id = b.id AND c.statut_code = 'en_cours' ORDER BY c.date_debut DESC NULLS LAST LIMIT 1) k ON TRUE
     WHERE b.actif AND b.niveau = 'unite' ORDER BY b.designation`);
  const places = rows.filter((r) => r.latitude !== null && r.longitude !== null);
  res.json({ total: rows.length, localises: places.length, non_localises: rows.length - places.length, biens: places.map((r) => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude) })) });
});

// Positionne les biens sans coordonnées à partir de leur adresse (géocodage BAN).
router.post('/geocoder', requirePerm('biens.write'), async (req, res) => {
  res.json(await geocodage.geocoderBiens(req.user, { tous: Boolean(req.body?.tous) }));
});

router.get('/:id', requirePerm('biens.read'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bien = await db.get(`SELECT * FROM ${t('biens')} WHERE id = $1`, [id]);
  if (!bien) throw httpError(404, 'Bien introuvable');
  delete bien.astech_raw;
  const [parent, enfants, contrats, manuels, nbDocs] = await Promise.all([
    bien.parent_id ? db.get(`SELECT id, designation, niveau FROM ${t('biens')} WHERE id = $1`, [bien.parent_id]) : null,
    db.all(`SELECT id, designation, niveau, type_code, statut_occupation FROM ${t('biens')} WHERE parent_id = $1 ORDER BY designation`, [id]),
    db.all(
      `SELECT c.id, c.numero, c.type_code, c.statut_code, c.position, c.date_debut, c.date_fin, c.date_entree, c.date_sortie, c.date_cloture,
              COALESCE(c.date_entree, c.date_debut) AS date_debut_occ, COALESCE(c.date_sortie, c.date_cloture, c.date_fin) AS date_fin_occ,
              (SELECT COALESCE(SUM(montant),0) FROM ${t('conditions_financieres')} cf WHERE cf.contrat_id = c.id AND cf.rubrique_code IN ('loyer','redevance') AND cf.date_fin IS NULL) AS loyer,
              (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id) AS contractants
       FROM ${t('contrat_biens')} cb JOIN ${t('contrats')} c ON c.id = cb.contrat_id WHERE cb.bien_id = $1 ORDER BY c.date_debut DESC NULLS LAST`, [id]),
    db.all(`SELECT * FROM ${t('occupations_historique')} WHERE bien_id = $1`, [id]),
    db.get(`SELECT count(*)::int AS n FROM ${t('document_liens')} WHERE objet_type = 'bien' AND objet_id = $1`, [id]),
  ]);
  res.json({ ...bien, parent, enfants, contrats, historique: buildHistorique(manuels, contrats), nb_documents: nbDocs.n });
});

router.post('/', requirePerm('biens.write'), async (req, res) => {
  if (!req.body?.designation) throw httpError(400, 'La désignation est obligatoire');
  res.status(201).json(await createRow({ table: 'biens', entite: 'bien', allowed: FIELDS, body: req.body, user: req.user }));
});

router.put('/:id', requirePerm('biens.write'), async (req, res) => {
  if (req.body.latitude !== undefined || req.body.longitude !== undefined) { req.body.geoloc_source = 'manuel'; }
  res.json(await updateRow({ table: 'biens', entite: 'bien', id: parseInt(req.params.id, 10), allowed: FIELDS, body: req.body, user: req.user, motif: req.body.motif }));
});

router.post('/:id/occupations', requirePerm('biens.write'), async (req, res) => {
  const b = req.body || {};
  const r = await db.get(
    `INSERT INTO ${t('occupations_historique')}(bien_id, type, contrat_id, contractant_id, date_debut, date_fin, commentaire)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, b.type === 'vacance' ? 'vacance' : 'occupation', b.contrat_id || null, b.contractant_id || null, b.date_debut || null, b.date_fin || null, b.commentaire || null]);
  res.status(201).json(r);
});

module.exports = router;
