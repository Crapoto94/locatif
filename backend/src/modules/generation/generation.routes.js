// Génération documentaire (maquette 18) et administration des modèles Word (DOC-011/012).
const router = require('express').Router();
const multer = require('multer');
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { httpError } = require('../../shared/http');
const audit = require('../../services/audit');
const docs = require('../documents/documents.service');
const svc = require('./generation.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/modeles', requirePerm('documents.read'), async (req, res) => {
  res.json(await db.all(`SELECT m.*, d.nom AS fichier, d.version FROM ${t('modeles_documents')} m LEFT JOIN ${t('documents')} d ON d.id = m.document_id ORDER BY m.libelle`));
});

// Dépôt / remplacement d'un modèle Word (balises {contractant}, {bien}, {nouveau_loyer}, …) : réservé à l'administration.
router.post('/modeles/:code', requirePerm('modeles.admin'), upload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Fichier .docx manquant');
  if (!/\.docx$/i.test(req.file.originalname)) throw httpError(400, 'Seuls les modèles .docx sont acceptés');
  const m = await db.get(`SELECT * FROM ${t('modeles_documents')} WHERE code = $1`, [req.params.code]);
  if (!m) throw httpError(404, 'Modèle inconnu');
  const nom = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  let doc;
  if (m.document_id) doc = await docs.addVersion(req.user, m.document_id, { buffer: req.file.buffer, nom, mime: req.file.mimetype });
  else {
    doc = await docs.create(user(req), { buffer: req.file.buffer, nom, mime: req.file.mimetype, type_code: 'modele_word' });
    await db.run(`UPDATE ${t('modeles_documents')} SET document_id = $2 WHERE id = $1`, [m.id, doc.id]);
  }
  await audit.log(req.user, 'template.updated', 'modele', m.code, { details: { fichier: nom } });
  res.json({ ok: true, document_id: doc.id });
});
const user = (req) => req.user;

router.delete('/modeles/:code', requirePerm('modeles.admin'), async (req, res) => {
  await db.run(`UPDATE ${t('modeles_documents')} SET document_id = NULL WHERE code = $1`, [req.params.code]);
  await audit.log(req.user, 'template.reset', 'modele', req.params.code, {});
  res.json({ ok: true });
});

router.get('/variables', requirePerm('documents.read'), (req, res) => res.json({
  communes: ['contrat', 'objet_contrat', 'date_jour', 'contractant', 'adresse_contractant', 'bien', 'adresse_bien'],
  revision_loyer: ['ancien_loyer', 'nouveau_loyer', 'indice_precedent', 'indice_nouveau', 'pourcentage', 'date_application'],
  regularisation_charges: ['annee', 'provisions', 'charges_reelles', 'solde', 'sens', 'detail'],
}));

router.post('/generer', requirePerm('documents.generer'), async (req, res) => {
  const { code, contrat_id, params } = req.body || {};
  if (!code || !contrat_id) throw httpError(400, 'Modèle et contrat obligatoires');
  try { res.status(201).json(await svc.generer(req.user, { code, contrat_id, params })); }
  catch (e) { throw e.status ? e : httpError(502, e.message); }
});

module.exports = router;
