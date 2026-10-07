// Tableau de bord opérationnel (maquette 01). Les montants sont des montants ATTENDUS / ÉCHÉANCÉS, jamais des encaissements (STA-007).
const router = require('express').Router();
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { addMonths, iso } = require('../echeancier/echeancier.service');

const moisDe = (dt) => iso(dt).slice(0, 7);

router.get('/', requirePerm('contrats.read'), async (req, res) => {
  const now = new Date(); const periode = moisDe(now);
  const mois = [0, 1, 2].map((i) => moisDe(addMonths(now, i)));
  const [kc, ke, kb, ka, camp, trim, mouv, alertes, recents] = await Promise.all([
    db.get(`SELECT count(*)::int AS actifs, count(*) FILTER (WHERE position = 'bailleur')::int AS bailleur, count(*) FILTER (WHERE position = 'preneur')::int AS preneur
            FROM ${t('contrats')} WHERE statut_code = 'en_cours'`),
    db.get(`SELECT COALESCE(SUM(montant_loyer),0) AS loyers, COALESCE(SUM(montant_charges),0) AS charges, COALESCE(SUM(montant_total),0) AS total, count(*)::int AS nb
            FROM ${t('echeances')} WHERE statut <> 'annulee' AND to_char(periode_debut,'YYYY-MM') = $1`, [periode]),
    db.get(`SELECT count(*) FILTER (WHERE statut_occupation = 'vacant' AND disponibilite = 'disponible')::int AS vacants, count(*)::int AS total
            FROM ${t('biens')} WHERE actif AND niveau = 'unite'`),
    db.get(`SELECT count(*)::int AS n FROM ${t('alertes')} WHERE statut = 'active'`),
    db.get(`SELECT c.statut, c.periode, count(e.id) FILTER (WHERE NOT e.campagne_retiree)::int AS nb, count(e.id) FILTER (WHERE e.anomalie IS NOT NULL AND NOT e.campagne_retiree)::int AS anomalies
            FROM ${t('campagnes')} c LEFT JOIN ${t('echeances')} e ON e.campagne_id = c.id WHERE c.periode = $1 GROUP BY c.id`, [periode]),
    db.all(`SELECT to_char(periode_debut,'YYYY-MM') AS periode, count(*)::int AS nb, COALESCE(SUM(montant_total),0) AS total FROM ${t('echeances')}
            WHERE statut <> 'annulee' AND to_char(periode_debut,'YYYY-MM') = ANY($1) GROUP BY 1 ORDER BY 1`, [mois]),
    db.all(`SELECT e.id, e.contrat_id, k.numero, e.prorata_jours, e.prorata_base, e.periode_debut, e.periode_fin, e.montant_total,
                   CASE WHEN k.date_entree BETWEEN e.periode_debut AND e.periode_fin THEN 'entree' WHEN COALESCE(k.date_sortie, k.date_cloture) BETWEEN e.periode_debut AND e.periode_fin THEN 'sortie' ELSE 'prorata' END AS mouvement,
                   (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = k.id) AS contractants
            FROM ${t('echeances')} e JOIN ${t('contrats')} k ON k.id = e.contrat_id WHERE e.prorata AND e.statut <> 'annulee' AND to_char(e.periode_debut,'YYYY-MM') = $1 ORDER BY e.montant_total DESC LIMIT 6`, [periode]),
    db.all(`SELECT a.id, a.type, a.titre, a.message, a.date_cible, a.objet_type, a.objet_id,
                   CASE a.objet_type WHEN 'contrat' THEN (SELECT numero FROM ${t('contrats')} WHERE id = a.objet_id) END AS objet_libelle
            FROM ${t('alertes')} a WHERE a.statut = 'active' ORDER BY a.date_cible NULLS LAST, a.id DESC LIMIT 6`),
    db.all(`SELECT c.id, c.numero, c.type_code, c.statut_code, c.date_fin, c.date_revision_prochaine,
                   (SELECT COALESCE(SUM(montant),0) FROM ${t('conditions_financieres')} cf WHERE cf.contrat_id = c.id AND cf.rubrique_code = 'loyer' AND cf.date_fin IS NULL) AS loyer,
                   (SELECT string_agg(b.designation, ', ') FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = c.id) AS bien,
                   (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id) AS contractant
            FROM ${t('contrats')} c ORDER BY c.updated_at DESC LIMIT 6`),
  ]);
  const parMois = Object.fromEntries(trim.map((x) => [x.periode, x]));
  res.json({
    periode,
    contrats: kc,
    echeances: ke,
    biens: { vacants: kb.vacants, total: kb.total, taux_vacance: kb.total ? Math.round((kb.vacants / kb.total) * 1000) / 10 : 0 },
    alertes: { actives: ka.n },
    campagne: camp ? { ...camp, taux: camp.nb ? Math.round(((camp.nb - camp.anomalies) / camp.nb) * 1000) / 10 : 100 } : null,
    trimestre: mois.map((m) => ({ periode: m, nb: parMois[m]?.nb || 0, total: parMois[m]?.total || 0 })),
    mouvements: mouv,
    a_traiter: alertes,
    recents,
  });
});

module.exports = router;
