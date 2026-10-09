// FILIEN : paramétrage (admin.filien), aperçu / génération pour une campagne, historique des exports.
const router = require('express').Router();
const { requirePerm } = require('../../middleware/auth');
const { httpError } = require('../../shared/http');
const { db, t } = require('../../db');
const svc = require('./filien.service');

// --- Paramétrage ---
router.get('/config', requirePerm('filien.read'), async (req, res) => {
  const [config, imputations, types] = await Promise.all([
    svc.lireConfig(), svc.listerImputations(),
    db.all(`SELECT code, libelle FROM ${t('ref_valeurs')} WHERE domaine = 'type_contrat' ORDER BY ordre, libelle`),
  ]);
  const docTypes = await db.all(`SELECT code, libelle FROM ${t('ref_valeurs')} WHERE domaine = 'type_document' AND COALESCE((meta->>'sensible')::boolean, false) = false ORDER BY ordre, libelle`);
  res.json({ config, imputations, problemes: svc.verifierConfig(config), rubriques: svc.RUBRIQUES.map(([code, libelle]) => ({ code, libelle })), types_contrat: types, types_document: docTypes, dossier_effectif: svc.racineDepot(config) });
});
router.put('/config', requirePerm('admin.filien'), async (req, res) => {
  const config = await svc.ecrireConfig(req.user, req.body || {});
  res.json({ config, problemes: svc.verifierConfig(config), dossier_effectif: svc.racineDepot(config) });
});
router.put('/imputations', requirePerm('admin.filien'), async (req, res) => res.json(await svc.remplacerImputations(req.user, req.body?.imputations)));
router.post('/test-depot', requirePerm('admin.filien'), async (req, res) => {
  const cfg = { ...(await svc.lireConfig()), ...(req.body || {}) };
  res.json(await svc.testerDepot(cfg));
});

// --- Campagne ---
router.get('/campagne/:periode/apercu', requirePerm('filien.read'), async (req, res) => res.json(await svc.apercu(req.params.periode)));
router.post('/campagne/:periode/generer', requirePerm('filien.generer'), async (req, res) => res.status(201).json(await svc.generer(req.user, req.params.periode)));

// --- Exports ---
router.get('/exports', requirePerm('filien.read'), async (req, res) => res.json(await svc.listerExports(req.query.periode)));
router.get('/exports/:id/fichier', requirePerm('filien.read'), async (req, res) => {
  const e = await svc.lireExport(parseInt(req.params.id, 10));
  if (!e) throw httpError(404, 'Export introuvable');
  // ISO-8859-1 : c'est l'encodage attendu par SEDIT, il est conservé au téléchargement.
  res.set('Content-Type', 'text/plain; charset=iso-8859-1').set('Content-Disposition', `attachment; filename="${e.fichier}"`).send(Buffer.from(e.contenu, 'latin1'));
});
router.post('/exports/:id/annuler', requirePerm('admin.filien'), async (req, res) => {
  const motif = String(req.body?.motif || '').trim();
  if (!motif) throw httpError(400, "Le motif de l'annulation est obligatoire");
  res.json(await svc.annuler(req.user, parseInt(req.params.id, 10), motif));
});

module.exports = router;
