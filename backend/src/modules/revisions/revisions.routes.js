// Indices et révisions (REV) : référentiel extensible, simulation avant validation, application en masse.
// CONVENTION DE CONCEPTION : nouveau loyer = ancien loyer × (indice nouveau / indice de référence) ;
// indice nouveau = même trimestre de l'année suivante (révision annuelle). Indice non publié => calcul bloqué (REV-008).
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { httpError, whereBuilder } = require('../../shared/http');
const audit = require('../../services/audit');
const ech = require('../echeancier/echeancier.service');

// ---- Valeurs d'indices -----------------------------------------------------------------------
router.get('/indices', requirePerm('revisions.read'), async (req, res) => {
  const w = whereBuilder();
  if (req.query.type) w.add('type_code = ?', req.query.type);
  if (req.query.annee) w.add('annee = ?', parseInt(req.query.annee, 10));
  res.json(await db.all(`SELECT * FROM ${t('indices_valeurs')} ${w.clause()} ORDER BY type_code, annee DESC, trimestre DESC LIMIT 400`, w.params));
});

router.post('/indices', requirePerm('revisions.write'), async (req, res) => {
  const b = req.body || {};
  if (!b.type_code || !b.annee || !b.trimestre) throw httpError(400, 'Type, année et trimestre sont obligatoires');
  if (b.trimestre < 1 || b.trimestre > 4) throw httpError(400, 'Trimestre entre 1 et 4');
  const prev = await db.get(`SELECT * FROM ${t('indices_valeurs')} WHERE type_code=$1 AND annee=$2 AND trimestre=$3`, [b.type_code, b.annee, b.trimestre]);
  const row = await db.get(
    `INSERT INTO ${t('indices_valeurs')}(type_code, annee, trimestre, libelle, valeur, date_publication) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (type_code, annee, trimestre) DO UPDATE SET valeur = EXCLUDED.valeur, date_publication = EXCLUDED.date_publication, libelle = COALESCE(EXCLUDED.libelle, ${t('indices_valeurs')}.libelle) RETURNING *`,
    [b.type_code, b.annee, b.trimestre, b.libelle || `${b.type_code} ${b.annee} T${b.trimestre}`, b.valeur === '' ? null : b.valeur, b.date_publication || null]);
  await audit.log(req.user, prev ? 'index.updated' : 'index.created', 'indice', row.id, { champ: 'valeur', ancienne: prev?.valeur, nouvelle: row.valeur, details: { type: b.type_code, annee: b.annee, trimestre: b.trimestre } });
  res.status(prev ? 200 : 201).json(row);
});

// ---- Calcul ----------------------------------------------------------------------------------
async function candidats(jusquA, ids) {
  const params = []; const conds = [`c.statut_code = 'en_cours'`, `c.indice_type IS NOT NULL`, `NOT c.gratuit`];
  if (ids?.length) { params.push(ids); conds.push(`c.id = ANY($${params.length})`); }
  else { params.push(jusquA); conds.push(`c.date_revision_prochaine IS NOT NULL AND c.date_revision_prochaine <= $${params.length}`); }
  return db.all(
    `SELECT c.id, c.numero, c.indice_type, c.indice_reference_id, c.date_revision_prochaine, c.date_revision_derniere,
            (SELECT COALESCE(SUM(montant),0) FROM ${t('conditions_financieres')} cf WHERE cf.contrat_id = c.id AND cf.rubrique_code = 'loyer' AND cf.date_fin IS NULL) AS loyer,
            (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id) AS contractants
     FROM ${t('contrats')} c WHERE ${conds.join(' AND ')} ORDER BY c.date_revision_prochaine NULLS LAST, c.numero`, params);
}

async function calculer(c) {
  const out = { contrat_id: c.id, numero: c.numero, contractants: c.contractants, indice_type: c.indice_type, loyer_avant: Number(c.loyer),
    date_revision: c.date_revision_prochaine, statut: 'ok', motif_blocage: null };
  const ref = c.indice_reference_id ? await db.get(`SELECT * FROM ${t('indices_valeurs')} WHERE id = $1`, [c.indice_reference_id]) : null;
  if (!ref || ref.valeur === null) { return { ...out, statut: 'bloquee', motif_blocage: 'Indice de référence non renseigné' }; }
  const nouv = await db.get(`SELECT * FROM ${t('indices_valeurs')} WHERE type_code = $1 AND annee = $2 AND trimestre = $3`, [c.indice_type, ref.annee + 1, ref.trimestre]);
  Object.assign(out, { indice_prec: ref.libelle, valeur_prec: ref.valeur, indice_prec_id: ref.id });
  if (!nouv || nouv.valeur === null) {
    return { ...out, statut: 'bloquee', motif_blocage: `Indice ${c.indice_type} ${ref.annee + 1} T${ref.trimestre} non publié : calcul automatique suspendu` };
  }
  const pct = ((nouv.valeur / ref.valeur) - 1) * 100;
  return { ...out, indice_nouv: nouv.libelle, valeur_nouv: nouv.valeur, indice_nouv_id: nouv.id, pourcentage: Math.round(pct * 10000) / 10000, loyer_apres: ech.round2(Number(c.loyer) * nouv.valeur / ref.valeur) };
}

// Simulation avant validation (REV-011 : présentation à préciser) — n'écrit rien.
router.post('/simuler', requirePerm('revisions.read'), async (req, res) => {
  const jusquA = req.body?.jusqu_a || ech.iso(ech.addMonths(new Date(), 3));
  const cs = await candidats(jusquA, req.body?.contrat_ids);
  const lignes = [];
  for (const c of cs) lignes.push(await calculer(c));
  res.json({ jusqu_a: jusquA, total: lignes.length, bloquees: lignes.filter((l) => l.statut === 'bloquee').length, lignes });
});

// Application en masse : les révisions bloquées sont ignorées et signalées (REV-ERR-001).
router.post('/appliquer', requirePerm('revisions.write'), async (req, res) => {
  const items = req.body?.items || [];
  if (!items.length) throw httpError(400, 'Aucun contrat sélectionné');
  const appliquees = []; const ignorees = [];
  for (const it of items) {
    const [c] = await candidats(null, [it.contrat_id]);
    if (!c) { ignorees.push({ contrat_id: it.contrat_id, motif: 'Contrat non éligible' }); continue; }
    const r = await calculer(c);
    if (r.statut !== 'ok') { ignorees.push({ contrat_id: c.id, numero: c.numero, motif: r.motif_blocage }); continue; }
    const dateAppli = it.date_application || c.date_revision_prochaine;
    await db.tx(async (tx) => {
      await tx.run(`UPDATE ${t('conditions_financieres')} SET date_fin = ($2::date - 1) WHERE contrat_id = $1 AND rubrique_code = 'loyer' AND date_fin IS NULL`, [c.id, dateAppli]);
      await tx.run(`INSERT INTO ${t('conditions_financieres')}(contrat_id, rubrique_code, libelle, montant, date_effet) VALUES ($1,'loyer','Loyer révisé',$2,$3)`, [c.id, r.loyer_apres, dateAppli]);
      const rattrapage = dateAppli < new Date().toISOString().slice(0, 10);
      const rev = await tx.get(
        `INSERT INTO ${t('revisions')}(contrat_id, date_revision, date_application, indice_prec_id, indice_nouv_id, pourcentage, montant_avant, montant_apres, statut, rattrapage, utilisateur)
         VALUES ($1,CURRENT_DATE,$2,$3,$4,$5,$6,$7,'appliquee',$8,$9) RETURNING id`,
        [c.id, dateAppli, r.indice_prec_id, r.indice_nouv_id, r.pourcentage, r.loyer_avant, r.loyer_apres, rattrapage, req.user.username]);
      const prochaine = ech.iso(ech.addMonths(ech.d(dateAppli), 12));
      await tx.run(`UPDATE ${t('contrats')} SET indice_reference_id = $2, date_revision_derniere = $3, date_revision_prochaine = $4, updated_at = now() WHERE id = $1`, [c.id, r.indice_nouv_id, dateAppli, prochaine]);
      // Les échéances planifiées à partir de la date d'application sont recalculées (les échéances émises ne sont jamais touchées).
      await tx.run(`UPDATE ${t('echeances')} SET montant_loyer = round(montant_loyer * $3 / NULLIF($2,0), 2), montant_total = round(montant_loyer * $3 / NULLIF($2,0), 2) + montant_charges, updated_at = now()
                    WHERE contrat_id = $1 AND statut = 'planifiee' AND periode_debut >= $4 AND NOT prorata`, [c.id, r.loyer_avant, r.loyer_apres, dateAppli]);
      await audit.log(req.user, 'revision.applied', 'contrat', c.id, { champ: 'loyer', ancienne: r.loyer_avant, nouvelle: r.loyer_apres, motif: `${r.indice_prec} → ${r.indice_nouv}`, details: { revision: rev.id, rattrapage } }, tx);
    });
    appliquees.push({ contrat_id: c.id, numero: c.numero, loyer_avant: r.loyer_avant, loyer_apres: r.loyer_apres });
  }
  res.json({ appliquees, ignorees });
});

router.get('/', requirePerm('revisions.read'), async (req, res) => {
  res.json(await db.all(
    `SELECT r.*, c.numero, ip.libelle AS indice_prec, inw.libelle AS indice_nouv FROM ${t('revisions')} r JOIN ${t('contrats')} c ON c.id = r.contrat_id
       LEFT JOIN ${t('indices_valeurs')} ip ON ip.id = r.indice_prec_id LEFT JOIN ${t('indices_valeurs')} inw ON inw.id = r.indice_nouv_id
     ORDER BY COALESCE(r.date_application, r.date_revision) DESC NULLS LAST LIMIT 300`));
});

module.exports = router;
