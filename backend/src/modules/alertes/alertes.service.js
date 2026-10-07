// Moteur d'alertes (ALT-001 à ALT-008). Idempotent : une clé (type|objet|jalon) ne crée l'alerte qu'une fois.
// Délais : 3 mois en général (ALT-002) ; bail loi 89 : rappels à 12 puis 9 mois (ALT-003). Paramétrables dans `settings`.
const { db, t } = require('../../db');
const apm = require('../../services/apm');
const { config } = require('../../config');
const { addMonths, iso } = require('../echeancier/echeancier.service');

const DEFAUTS = { delai_mois: 3, bail89_rappels_mois: [12, 9], vacance_mois: 6,
  // DOC-003/004 : pièces citées obligatoires (sauf notification) ; paramétrable par type de contractant.
  regle_documentaire: { tous: ['contrat', 'decision_municipale', 'deliberation'], morale: ['kbis|statuts', 'siren'], physique: [] } };

async function params() {
  const row = await db.get(`SELECT valeur FROM ${t('settings')} WHERE cle = 'alertes'`);
  return { ...DEFAUTS, ...(row?.valeur || {}) };
}

async function creer(a) {
  const r = await db.run(
    `INSERT INTO ${t('alertes')}(cle, type, objet_type, objet_id, titre, message, date_cible, assigne_a) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (cle) DO NOTHING`, [a.cle, a.type, a.objet_type, a.objet_id, a.titre, a.message || null, a.date_cible || null, a.assigne_a || null]);
  return r.changes;
}

async function calculer() {
  const p = await params(); const today = iso(new Date()); const horizon = iso(addMonths(new Date(), p.delai_mois));
  let n = 0;

  // Fin de contrat + rappels loi 89
  const fins = await db.all(`SELECT id, numero, type_code, date_fin, gestionnaire FROM ${t('contrats')} WHERE statut_code = 'en_cours' AND date_fin IS NOT NULL`);
  for (const c of fins) {
    const is89 = c.type_code === 'bail_habitation_89';
    const jalons = is89 ? p.bail89_rappels_mois : [p.delai_mois];
    for (const m of jalons) {
      const seuil = iso(addMonths(new Date(`${c.date_fin}T00:00:00Z`), -m));
      if (seuil > today || c.date_fin < today) continue;
      n += await creer({ cle: `fin|${c.id}|${m}`, type: 'fin_contrat', objet_type: 'contrat', objet_id: c.id, date_cible: c.date_fin, assigne_a: c.gestionnaire,
        titre: `Échéance ${is89 ? 'bail loi 1989' : 'du contrat'} ${c.numero} (rappel à ${m} mois)`,
        message: `Fin du contrat le ${c.date_fin}. Renouvellement express ou fin à préparer.` });
    }
  }

  // Révisions à échéance
  for (const c of await db.all(`SELECT id, numero, date_revision_prochaine, indice_type, gestionnaire FROM ${t('contrats')} WHERE statut_code = 'en_cours' AND date_revision_prochaine IS NOT NULL AND date_revision_prochaine <= $1`, [horizon])) {
    n += await creer({ cle: `rev|${c.id}|${c.date_revision_prochaine}`, type: 'revision', objet_type: 'contrat', objet_id: c.id, date_cible: c.date_revision_prochaine, assigne_a: c.gestionnaire,
      titre: `Révision ${c.indice_type || ''} à préparer — ${c.numero}`, message: `Date anniversaire de révision : ${c.date_revision_prochaine}.` });
  }

  // Assurance expirante / documents périodiques (DOC-009)
  for (const dc of await db.all(
    `SELECT d.id, d.nom, d.type_code, COALESCE(d.date_expiration, d.date_attendue) AS echeance, l.objet_id
     FROM ${t('documents')} d JOIN ${t('document_liens')} l ON l.document_id = d.id AND l.objet_type = 'contrat'
     WHERE d.actif AND COALESCE(d.date_expiration, d.date_attendue) IS NOT NULL AND COALESCE(d.date_expiration, d.date_attendue) <= $1`, [horizon])) {
    n += await creer({ cle: `assur|${dc.id}|${dc.echeance}`, type: dc.type_code === 'attestation_assurance' ? 'assurance_expirante' : 'document_manquant',
      objet_type: 'contrat', objet_id: dc.objet_id, date_cible: dc.echeance,
      titre: `${dc.type_code === 'attestation_assurance' ? 'Attestation d\'assurance à renouveler' : 'Document attendu'} : ${dc.nom}`, message: `Échéance : ${dc.echeance}.` });
  }

  // Document manquant (règle documentaire paramétrable)
  const contrats = await db.all(
    `SELECT c.id, c.numero, c.gestionnaire, c.gratuit,
       (SELECT array_agg(DISTINCT d.type_code) FROM ${t('document_liens')} l JOIN ${t('documents')} d ON d.id = l.document_id AND d.actif WHERE l.objet_type = 'contrat' AND l.objet_id = c.id) AS types,
       (SELECT array_agg(DISTINCT ct.type) FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = c.id) AS profils
     FROM ${t('contrats')} c WHERE c.statut_code = 'en_cours' AND c.astech_id IS NULL`); // contrats repris d'ASTECH : pas d'alerte de masse sur l'historique
  for (const c of contrats) {
    const requis = [...p.regle_documentaire.tous, ...(c.profils || []).flatMap((x) => p.regle_documentaire[x] || [])];
    const manquants = requis.filter((r) => !r.split('|').some((alt) => (c.types || []).includes(alt)));
    if (manquants.length) n += await creer({ cle: `docs|${c.id}|${manquants.join(',')}`, type: 'document_manquant', objet_type: 'contrat', objet_id: c.id, assigne_a: c.gestionnaire,
      titre: `Pièce(s) manquante(s) — ${c.numero}`, message: `Manquant : ${manquants.join(', ')}.` });
  }

  // Vacance prolongée
  const limite = iso(addMonths(new Date(), -p.vacance_mois));
  for (const b of await db.all(
    `SELECT b.id, b.designation, MAX(COALESCE(c.date_sortie, c.date_cloture, c.date_fin)) AS depuis
     FROM ${t('biens')} b LEFT JOIN ${t('contrat_biens')} cb ON cb.bien_id = b.id LEFT JOIN ${t('contrats')} c ON c.id = cb.contrat_id
     WHERE b.actif AND b.niveau = 'unite' AND b.disponibilite = 'disponible' AND b.statut_occupation = 'vacant' GROUP BY b.id, b.designation
     HAVING MAX(COALESCE(c.date_sortie, c.date_cloture, c.date_fin)) <= $1`, [limite])) {
    n += await creer({ cle: `vac|${b.id}|${b.depuis}`, type: 'vacance_prolongee', objet_type: 'bien', objet_id: b.id, date_cible: b.depuis,
      titre: `Vacance prolongée — ${b.designation}`, message: `Bien vacant depuis le ${b.depuis} (plus de ${p.vacance_mois} mois).` });
  }

  // Anomalies d'échéancier
  for (const e of await db.all(
    `SELECT e.id, e.contrat_id, k.numero, e.periode_debut, e.anomalie FROM ${t('echeances')} e JOIN ${t('contrats')} k ON k.id = e.contrat_id
     WHERE e.anomalie IS NOT NULL AND e.statut <> 'annulee' AND e.periode_debut >= date_trunc('month', now() - interval '1 month')`)) {
    n += await creer({ cle: `ech|${e.id}|${e.anomalie.slice(0, 40)}`, type: 'anomalie_echeancier', objet_type: 'contrat', objet_id: e.contrat_id, date_cible: e.periode_debut,
      titre: `Anomalie d'échéancier — ${e.numero}`, message: e.anomalie });
  }
  return { creees: n };
}

// Notification par mail (ALT-007). Teams n'est pas disponible via l'APM : hors périmètre V1+.
async function notifier() {
  if (!apm.configured()) return { envoyees: 0, raison: 'APM non configuré' };
  const nouvelles = await db.all(`SELECT * FROM ${t('alertes')} WHERE statut = 'active' AND notifie_le IS NULL ORDER BY date_cible NULLS LAST LIMIT 200`);
  if (!nouvelles.length) return { envoyees: 0 };
  const users = await db.all(`SELECT username, email FROM ${t('users')} WHERE actif AND email IS NOT NULL`);
  const byUser = Object.fromEntries(users.map((u) => [u.username, u.email]));
  const defaut = process.env.ALERT_MAIL_TO;
  const groupes = new Map();
  for (const a of nouvelles) {
    const to = (a.assigne_a && byUser[String(a.assigne_a).toLowerCase()]) || defaut;
    if (!to) continue;
    if (!groupes.has(to)) groupes.set(to, []);
    groupes.get(to).push(a);
  }
  let envoyees = 0;
  const base = config.publicBaseUrl ? config.publicBaseUrl.replace(/\/$/, '') : '';
  for (const [to, list] of groupes) {
    const li = list.map((a) => `<li><strong>${a.titre}</strong>${a.date_cible ? ` — ${a.date_cible}` : ''}<br/>${a.message || ''}</li>`).join('');
    try {
      await apm.mailSend({ to, subject: `VibeLocatif — ${list.length} alerte(s) à traiter`,
        content: `<p>Bonjour,</p><p>${list.length} alerte(s) nécessitent votre attention :</p><ul>${li}</ul>${base ? `<p><a href="${base}/alertes">Ouvrir le centre des alertes</a></p>` : ''}` });
      await db.run(`UPDATE ${t('alertes')} SET notifie_le = now() WHERE id = ANY($1)`, [list.map((a) => a.id)]);
      envoyees += list.length;
    } catch (e) { console.warn('[ALERTES] mail non envoyé :', e.message); }
  }
  return { envoyees };
}

module.exports = { calculer, notifier, params, DEFAUTS };
