// API documents (/api/v1/documents) — façade de stockage : filer d'abord, GED Alfresco ensuite.
const router = require('express').Router();
const multer = require('multer');
const { db, t } = require('../../db');
const { requirePerm, can } = require('../../middleware/auth');
const { pageParams, httpError } = require('../../shared/http');
const audit = require('../../services/audit');
const svc = require('./documents.service');
const store = require('./store/store');

const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || '50', 10);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024 } });
// multer lit les noms en latin1 : on les remet en UTF-8 (accents).
const fixName = (n) => Buffer.from(n || 'fichier', 'latin1').toString('utf8');
const parseLinks = (v) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };

router.get('/', requirePerm('documents.read'), async (req, res) => {
  const { limit, offset } = pageParams(req.query, { def: 50 });
  res.json(await svc.list({ ...req.query, limit, offset, sensibleOk: can(req, 'documents.sensible') }));
});

router.get('/obligations', requirePerm('documents.read'), async (req, res) => {
  res.json(await db.all(
    `SELECT d.id, d.nom, d.type_code, d.date_attendue, d.date_expiration,
            (SELECT json_agg(json_build_object('objet_type', objet_type, 'objet_id', objet_id)) FROM ${t('document_liens')} WHERE document_id = d.id) AS liens
     FROM ${t('documents')} d WHERE d.actif AND (d.date_attendue IS NOT NULL OR d.date_expiration IS NOT NULL)
     ORDER BY COALESCE(d.date_expiration, d.date_attendue) LIMIT 500`));
});

router.post('/', requirePerm('documents.write'), upload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Fichier manquant');
  const b = req.body;
  if (b.sensible === 'true' && !can(req, 'documents.sensible')) throw httpError(403, 'Droit insuffisant pour une pièce sensible');
  const doc = await svc.create(req.user, {
    buffer: req.file.buffer, nom: fixName(req.file.originalname), mime: req.file.mimetype, type_code: b.type_code || null,
    sensible: b.sensible === undefined ? undefined : b.sensible === 'true', links: parseLinks(b.links),
    date_attendue: b.date_attendue, date_expiration: b.date_expiration, commentaire: b.commentaire,
  });
  res.status(201).json(doc);
});

// Import par un script de reprise (poste ayant accès aux partages sources) : le serveur écrit lui-même fichier et base.
router.post('/import/verifier', requirePerm('documents.write'), async (req, res) => {
  const items = Array.isArray(req.body?.pieces) ? req.body.pieces : [];
  res.json({ a_envoyer: await svc.aEnvoyer(items.filter((i) => i?.astech_id)) });
});

router.post('/import', requirePerm('documents.write'), upload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Fichier manquant');
  const b = req.body;
  if (!b.astech_id) throw httpError(400, 'astech_id manquant');
  if (b.sensible === 'true' && !can(req, 'documents.sensible')) throw httpError(403, 'Droit insuffisant pour une pièce sensible');
  res.status(201).json(await svc.importer(req.user, {
    buffer: req.file.buffer, nom: fixName(req.file.originalname), mime: b.mime || (req.file.mimetype !== 'application/octet-stream' ? req.file.mimetype : null),
    type_code: b.type_code || null, sensible: b.sensible === undefined ? undefined : b.sensible === 'true', links: parseLinks(b.links),
    commentaire: b.commentaire || null, astech_id: b.astech_id,
  }));
});

async function loadDoc(req) {
  const d = await db.get(`SELECT * FROM ${t('documents')} WHERE id = $1 AND actif`, [req.params.id]);
  if (!d) throw httpError(404, 'Document introuvable');
  if (d.sensible && !can(req, 'documents.sensible')) throw httpError(403, 'Pièce sensible : accès réservé aux profils habilités');
  return d;
}

router.get('/:id', requirePerm('documents.read'), async (req, res) => {
  const d = await loadDoc(req);
  d.liens = await db.all(`SELECT objet_type, objet_id FROM ${t('document_liens')} WHERE document_id = $1`, [d.id]);
  res.json(d);
});

router.get('/:id/download', requirePerm('documents.read'), async (req, res) => {
  const d = await loadDoc(req);
  let file;
  try { file = await store.get(d.storage_key); } catch (e) { throw httpError(502, e.message); }
  if (d.sensible) await audit.log(req.user, 'document.consulted', 'document', d.id, { details: { sensible: true } });
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${req.query.inline || req.query.mode === 'inline' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nom)}`);
  res.send(file.buffer);
});

// Contenu d'une version précise (visionneuse) : mode=inline pour l'affichage dans la page, sinon téléchargement.
router.get('/:id/versions/:version/content', requirePerm('documents.read'), async (req, res) => {
  const d = await loadDoc(req);
  const v = await db.get(`SELECT storage_key FROM ${t('document_versions')} WHERE document_id = $1 AND version = $2`, [d.id, Number(req.params.version)]);
  if (!v) throw httpError(404, 'Version introuvable');
  let file;
  try { file = await store.get(v.storage_key); } catch (e) { throw httpError(502, e.message); }
  if (d.sensible) await audit.log(req.user, 'document.consulted', 'document', d.id, { details: { sensible: true, version: Number(req.params.version) } });
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${req.query.mode === 'inline' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nom)}`);
  res.send(file.buffer);
});

router.get('/:id/versions', requirePerm('documents.read'), async (req, res) => {
  await loadDoc(req);
  res.json(await db.all(`SELECT version, sha256, taille, auteur, created_at FROM ${t('document_versions')} WHERE document_id = $1 ORDER BY version DESC`, [req.params.id]));
});

router.post('/:id/version', requirePerm('documents.write'), upload.single('file'), async (req, res) => {
  await loadDoc(req);
  if (!req.file) throw httpError(400, 'Fichier manquant');
  const d = await svc.addVersion(req.user, req.params.id, { buffer: req.file.buffer, nom: fixName(req.file.originalname), mime: req.file.mimetype });
  res.json(d);
});

router.put('/:id', requirePerm('documents.write'), async (req, res) => {
  const d = await loadDoc(req);
  const b = req.body;
  await db.run(
    `UPDATE ${t('documents')} SET nom=COALESCE($2,nom), type_code=COALESCE($3,type_code), date_attendue=$4, date_expiration=$5,
       commentaire=COALESCE($6,commentaire), updated_at=now() WHERE id=$1`,
    [d.id, b.nom || null, b.type_code || null, b.date_attendue || null, b.date_expiration || null, b.commentaire ?? null]);
  await audit.log(req.user, 'document.updated', 'document', d.id, { details: b });
  res.json({ ok: true });
});

router.post('/:id/liens', requirePerm('documents.write'), async (req, res) => {
  const d = await loadDoc(req);
  await svc.addLinks(db, d.id, [req.body]);
  res.status(201).json({ ok: true });
});

router.delete('/:id/liens', requirePerm('documents.write'), async (req, res) => {
  const d = await loadDoc(req);
  await db.run(`DELETE FROM ${t('document_liens')} WHERE document_id=$1 AND objet_type=$2 AND objet_id=$3`, [d.id, req.query.objet_type, Number(req.query.objet_id)]);
  res.json({ ok: true });
});

// Suppression logique : le fichier reste dans le stockage (durées de conservation à définir avec le DPO).
router.delete('/:id', requirePerm('documents.write'), async (req, res) => {
  const d = await loadDoc(req);
  await db.run(`UPDATE ${t('documents')} SET actif = FALSE, updated_at = now() WHERE id = $1`, [d.id]);
  await audit.log(req.user, 'document.deleted', 'document', d.id, { details: { nom: d.nom } });
  res.json({ ok: true });
});

module.exports = router;
