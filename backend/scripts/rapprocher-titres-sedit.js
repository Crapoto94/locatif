// Retrouve dans SEDIT le TITRE (de recette) des échéances titrées, puis met à jour son état de paiement (FI.MVTLIGNE / FI.MANDAT, lecture seule).
//   node scripts/rapprocher-titres-sedit.js [--appliquer]        (sans --appliquer : simulation)
// Un loyer est une recette : SEDIT l'enregistre dans la table MANDAT avec le sens « R » (titre) ; le sens « M » désigne un mandat de dépense.
// ASTECH ne garde que des dates (CONTEC_NUMMAN est vide) ; SEDIT porte le numéro. Rapprochement par :
//   tiers rapproché du contractant  +  mois indiqué dans le libellé (« REDEVANCE AOUT 2026 »)  +  montant TTC en EUROS (MONTANTTC_E ;
//   MONTANTTC est en francs), les lignes d'un même titre étant additionnées (redevance + charges).
// - Un titre rejeté puis réémis (même mois, même montant) : le titre rejeté est écarté au profit de la réémission.
// - « exact » : un seul titre correspond au mois et au montant ; « probable » : à défaut, un seul titre de même montant dont la date
//   est proche (45 jours) de la date de titrage ASTECH. Rien n'est écrit en cas de doute (plusieurs titres possibles).
// - Paiement : lu sur le titre (DATE_PAIEMENT, DATE_PRISE_EN_CHARGE, REJET, SUSPENSION). SEDIT ne donne que la DATE de paiement, pas le
//   montant encaissé : un paiement partiel n'est pas visible (INT-PAY-004 reste à spécifier avec la DSF).
const { db, t } = require('../src/db');
const src = require('../src/modules/reprise/astech.source');
const { config, checkConfig } = require('../src/config');

const MOIS = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const jours = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const binds = (n) => Array.from({ length: n }, (_, i) => ':' + (i + 1)).join(',');

async function connect() {
  const e = process.env;
  if (!e.SEDIT_HOST || !e.SEDIT_USER || !e.SEDIT_PASSWORD) throw new Error('Paramètres SEDIT absents (SEDIT_HOST, SEDIT_PORT, SEDIT_SERVICE, SEDIT_USER, SEDIT_PASSWORD)');
  return src.loadOracle().getConnection({ user: e.SEDIT_USER, password: e.SEDIT_PASSWORD, connectString: `${e.SEDIT_HOST}:${e.SEDIT_PORT || 1527}/${e.SEDIT_SERVICE || 'SMPROD'}` });
}

// État de paiement d'un titre à partir de ses dates SEDIT.
function etatPaiement(m) {
  if (m.REJET === 'O' || m.MANDREJETE === 'O') return 'rejete';
  if (m.DP) return 'paye';
  if (m.SUSPENSION === 'O') return 'suspendu';
  return m.PEC ? 'a_payer' : 'non_pris_en_charge';
}

async function run(conn, { appliquer = false } = {}) {
  const depuis = config.repriseDepuis;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis)) throw new Error('LOCATIF_REPRISE_DEPUIS invalide');
  const ech = await db.all(
    `SELECT e.id, e.periode_debut, e.montant_total, e.date_titrage, e.titre_numero,
            (SELECT array_agg(ct.tiers_sedit_roo) FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id
              WHERE cc.contrat_id = e.contrat_id AND ct.tiers_sedit_roo IS NOT NULL) AS roos
     FROM ${t('echeances')} e WHERE e.statut = 'titree' AND e.periode_debut >= $1`, [depuis]);
  const cibles = ech.filter((e) => e.roos?.length);
  const stats = { echeances: ech.length, sans_tiers_rapproche: ech.length - cibles.length, exact: 0, probable: 0, ambigu: 0, introuvable: 0, paiement: {} };

  if (cibles.length) {
    const roos = [...new Set(cibles.flatMap((e) => e.roos))];
    const lignes = await src.rows(conn,
      `SELECT TRIM(TIERS) AS TIERS, MANDAT, TO_CHAR(DATMANDAT,'YYYY-MM-DD') AS DM, BORDEREAU, LIBELLE, MONTANTTC_E AS MT FROM FI.MVTLIGNE
       WHERE TRIM(TIERS) IN (${binds(roos.length)}) AND DATMANDAT >= DATE '${depuis}'`, roos);
    const groupes = new Map();
    for (const l of lignes) {
      const k = `${l.TIERS}|${l.MANDAT}|${l.DM}`;
      if (!groupes.has(k)) groupes.set(k, { tiers: l.TIERS, mandat: l.MANDAT, dm: l.DM, bord: l.BORDEREAU, total: 0, libs: [] });
      const g = groupes.get(k); g.total += Number(l.MT || 0); g.libs.push(norm(l.LIBELLE));
    }
    // Candidats : le TITRE entier (lignes additionnées : redevance + charges) ET chaque LIGNE seule — un même titre peut regrouper
    // plusieurs contrats d'un même tiers, auquel cas seule la ligne correspond au montant d'une échéance.
    const lignesObj = lignes.map((l) => ({ tiers: l.TIERS, mandat: l.MANDAT, dm: l.DM, bord: l.BORDEREAU, total: Number(l.MT || 0), libs: [norm(l.LIBELLE)] }));
    const gl = [...groupes.values(), ...lignesObj];
    const unique = (liste) => [...new Map(liste.map((g) => [`${g.tiers}|${g.mandat}|${g.dm}`, g])).values()]; // un même titre peut ressortir deux fois (ligne et total)
    // Identifiants techniques (lien vers la fiche SEDIT) : un seul ROO par (n°, date), sinon pas de lien.
    const roosTitre = new Map(); const rejetes = new Set(); // titres rejetés : réémis ensuite sous un autre numéro
    for (const m of await src.rows(conn, `SELECT TRIM(ROO_IMA_REF) AS ROO, MANDAT, TO_CHAR(DATMANDAT,'YYYY-MM-DD') AS DM, REJET, MANDREJETE FROM FI.MANDAT WHERE SENSMVT = 'R' AND DATMANDAT >= DATE '${depuis}'`)) {
      const k = `${m.MANDAT}|${m.DM}`; roosTitre.set(k, roosTitre.has(k) ? null : m.ROO);
      if (m.REJET === 'O' || m.MANDREJETE === 'O') rejetes.add(k);
    }
    // Quand plusieurs titres correspondent (titre rejeté puis réémis), on retient ceux qui n'ont pas été rejetés.
    const nonRejetes = (liste) => { const v = liste.filter((g) => !rejetes.has(`${g.mandat}|${g.dm}`)); return v.length ? v : liste; };
    for (const e of cibles) {
      const d = new Date(`${e.periode_debut}T00:00:00Z`); const mot = `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      const memeMontant = nonRejetes(unique(gl.filter((g) => e.roos.includes(g.tiers) && Math.abs(g.total - Number(e.montant_total)) < 0.011)));
      const memeMois = nonRejetes(memeMontant.filter((g) => g.libs.some((l) => l.includes(mot))));
      let choix = null; let confiance = null;
      if (memeMois.length === 1) { choix = memeMois[0]; confiance = 'exact'; }
      else {
        const pool = (memeMois.length ? memeMois : memeMontant).filter((g) => !e.date_titrage || jours(g.dm, e.date_titrage) <= 45);
        if (pool.length === 1) { choix = pool[0]; confiance = 'probable'; }
        else if (pool.length > 1) { stats.ambigu++; continue; }
      }
      if (!choix) { stats.introuvable++; continue; }
      stats[confiance]++;
      if (appliquer) {
        await db.run(
          `UPDATE ${t('echeances')} SET titre_numero = $2, titre_exercice = $3, titre_date = $4, titre_bordereau = $5, titre_roo = $6, titre_confiance = $7, titre_verifie_le = now() WHERE id = $1`,
          [e.id, choix.mandat, Number(choix.dm.slice(0, 4)), choix.dm, choix.bord, roosTitre.get(`${choix.mandat}|${choix.dm}`) || null, confiance]);
      }
    }
  }

  // Paiement : pour tous les titres dont l'identifiant technique est connu (rafraîchi à chaque passage).
  const avecRoo = await db.all(`SELECT id, titre_roo FROM ${t('echeances')} WHERE titre_roo IS NOT NULL`);
  const parRoo = new Map(); for (const e of avecRoo) (parRoo.get(e.titre_roo) || parRoo.set(e.titre_roo, []).get(e.titre_roo)).push(e.id);
  const listeRoos = [...parRoo.keys()];
  for (let i = 0; i < listeRoos.length; i += 500) {
    const part = listeRoos.slice(i, i + 500);
    const rows = await src.rows(conn,
      `SELECT TRIM(ROO_IMA_REF) AS ROO, TO_CHAR(DATE_PRISE_EN_CHARGE,'YYYY-MM-DD') AS PEC, TO_CHAR(DATE_PAIEMENT,'YYYY-MM-DD') AS DP, REJET, MANDREJETE, SUSPENSION
       FROM FI.MANDAT WHERE TRIM(ROO_IMA_REF) IN (${binds(part.length)})`, part);
    for (const m of rows) {
      const etat = etatPaiement(m); stats.paiement[etat] = (stats.paiement[etat] || 0) + (parRoo.get(m.ROO)?.length || 0);
      if (appliquer) await db.run(`UPDATE ${t('echeances')} SET titre_etat = $2, titre_prise_en_charge_le = $3, titre_paiement_le = $4 WHERE id = ANY($1)`, [parRoo.get(m.ROO), etat, m.PEC, m.DP]);
    }
  }
  return { stats };
}

module.exports = { run, etatPaiement };

if (require.main === module) {
  (async () => {
    checkConfig();
    const conn = await connect();
    const appliquer = process.argv.includes('--appliquer');
    const r = await run(conn, { appliquer });
    console.log(JSON.stringify({ ...r.stats, appliquer }));
    await conn.close(); process.exit(0);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
