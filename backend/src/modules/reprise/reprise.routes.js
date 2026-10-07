// Contrôle de reprise (maquette 29) : lancement, rapports, écarts source / application, doublons à examiner.
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { httpError, pageParams } = require('../../shared/http');
const audit = require('../../services/audit');
const importer = require('./astech.import');

router.use(requirePerm('admin.reprise'));
let enCours = null; // une seule reprise à la fois

router.get('/runs', async (req, res) => {
  res.json(await db.all(`SELECT id, debut, fin, statut, environnement, options, stats, erreur, utilisateur FROM ${t('reprise_runs')} ORDER BY id DESC LIMIT 30`));
});

router.get('/runs/:id', async (req, res) => {
  const r = await db.get(`SELECT * FROM ${t('reprise_runs')} WHERE id = $1`, [req.params.id]);
  if (!r) throw httpError(404, 'Reprise introuvable');
  const { limit, offset } = pageParams(req.query, { def: 100, max: 500 });
  r.anomalies = await db.all(`SELECT niveau, objet, reference, message FROM ${t('reprise_anomalies')} WHERE run_id = $1 ORDER BY id LIMIT ${limit} OFFSET ${offset}`, [r.id]);
  r.nb_anomalies = (await db.get(`SELECT count(*)::int AS n FROM ${t('reprise_anomalies')} WHERE run_id = $1`, [r.id])).n;
  res.json(r);
});

router.get('/statut', (req, res) => res.json({ en_cours: Boolean(enCours), depuis: enCours?.depuis || null }));

// Lancement asynchrone : la réponse est immédiate, le suivi se fait par /runs.
router.post('/lancer', (req, res) => {
  if (enCours) throw httpError(409, 'Une reprise est déjà en cours');
  const b = req.body || {};
  const env = b.env === 'test' ? 'test' : 'prod';
  enCours = { depuis: new Date().toISOString() };
  importer.run({ env, documents: Boolean(b.documents), dryRun: Boolean(b.dryRun), user: req.user.username, log: (m) => console.log('[REPRISE]', m) })
    .then((r) => console.log(`[REPRISE] terminée (run ${r.run_id})`))
    .catch((e) => console.error('[REPRISE] échec :', e.message))
    .finally(() => { enCours = null; });
  audit.log(req.user, 'migration.started', 'reprise', env, { details: b });
  res.status(202).json({ accepte: true, env, dryRun: Boolean(b.dryRun), documents: Boolean(b.documents) });
});

// Écarts source ASTECH (dernier rapport non simulé) / application.
router.get('/controle', async (req, res) => {
  const last = await db.get(`SELECT id, fin, stats, options FROM ${t('reprise_runs')} WHERE statut = 'termine' AND NOT COALESCE((options->>'dryRun')::boolean, FALSE) ORDER BY id DESC LIMIT 1`);
  const src = last?.stats?.source || {};
  const app = await db.get(
    `SELECT (SELECT count(*)::int FROM ${t('biens')} WHERE astech_id NOT LIKE 'CODE:%') AS biens, (SELECT count(*)::int FROM ${t('contrats')} WHERE astech_id IS NOT NULL) AS contrats,
            (SELECT count(*)::int FROM ${t('echeances')} WHERE source = 'astech_prev') AS ech_prev, (SELECT count(*)::int FROM ${t('echeances')} WHERE source = 'astech_hist') AS ech_hist,
            (SELECT count(*)::int FROM ${t('revisions')} WHERE astech_id IS NOT NULL) AS revisions, (SELECT count(*)::int FROM ${t('indices_valeurs')} WHERE astech_id IS NOT NULL) AS indices,
            (SELECT count(*)::int FROM ${t('contractants')}) AS contractants, (SELECT count(*)::int FROM ${t('documents')} WHERE astech_id IS NOT NULL) AS documents`);
  const ligne = (objet, source, appli, note) => ({ objet, source: source ?? null, application: appli, ecart: source == null ? null : appli - source, note: note || null });
  res.json({
    dernier_run: last ? { id: last.id, fin: last.fin } : null,
    lignes: [
      ligne('Biens locatifs', src.ARBO_LOCATIF, app.biens), ligne('Contrats locatifs', src.CONTRAT_LOCATIF, app.contrats),
      ligne('Échéances prévisionnelles', src.CONTRAT_ECH, app.ech_prev, 'Les périodes déjà présentes dans l\'historique émis ne sont pas reprises en double'),
      ligne('Échéances historiques', src.CONTRAT_ECHTERMINEE, app.ech_hist), ligne('Révisions', src.CONTRAT_REVISION, app.revisions), ligne('Indices', src.INDICEINSEE, app.indices),
      ligne('Contractants (créés par nom)', null, app.contractants, 'ASTECH ne porte pas de table de contractants'), ligne('Documents', null, app.documents),
    ],
  });
});

router.get('/doublons', async (req, res) => {
  const statut = req.query.statut || 'a_examiner';
  res.json(await db.all(
    `SELECT d.*, CASE d.entite WHEN 'contractant' THEN (SELECT nom FROM ${t('contractants')} WHERE id = d.id_a) ELSE (SELECT designation FROM ${t('biens')} WHERE id = d.id_a) END AS libelle_a,
            CASE d.entite WHEN 'contractant' THEN (SELECT nom FROM ${t('contractants')} WHERE id = d.id_b) ELSE (SELECT designation FROM ${t('biens')} WHERE id = d.id_b) END AS libelle_b
     FROM ${t('reprise_doublons')} d WHERE d.statut = $1 ORDER BY d.id LIMIT 500`, [statut]));
});

// Aucune fusion automatique : l'utilisateur tranche (distincts) ou marque pour fusion manuelle (MIG-006).
router.put('/doublons/:id', async (req, res) => {
  const statut = req.body?.statut;
  if (!['distincts', 'a_fusionner_manuellement', 'a_examiner'].includes(statut)) throw httpError(400, 'Statut inconnu');
  const r = await db.run(`UPDATE ${t('reprise_doublons')} SET statut = $2, examine_par = $3, examine_le = now() WHERE id = $1`, [req.params.id, statut, req.user.username]);
  if (!r.changes) throw httpError(404, 'Doublon introuvable');
  await audit.log(req.user, 'migration.duplicate_reviewed', 'doublon', req.params.id, { champ: 'statut', nouvelle: statut, motif: req.body?.commentaire });
  res.json({ ok: true });
});

module.exports = router;
