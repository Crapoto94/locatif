// Retrouve dans SEDIT le numéro de mandat des échéances mandatées (FI.MVTLIGNE / FI.MANDAT, lecture seule).
//   node scripts/rapprocher-mandats-sedit.js [--appliquer]        (sans --appliquer : simulation)
// ASTECH ne garde que des dates (CONTEC_NUMMAN est vide) ; SEDIT porte le numéro. Rapprochement par :
//   tiers rapproché du contractant  +  mois indiqué dans le libellé (« REDEVANCE AOUT 2026 »)  +  montant TTC en EUROS (MONTANTTC_E ;
//   MONTANTTC est en francs), les lignes d'un même mandat étant additionnées (redevance + charges).
// - « exact » : un seul mandat correspond au mois et au montant ; « probable » : à défaut, un seul mandat de même montant dont la date
//   est proche (45 jours) de la date de mandatement ASTECH. Rien n'est écrit en cas de doute (plusieurs mandats possibles).
const { db, t } = require('../src/db');
const src = require('../src/modules/reprise/astech.source');
const { config, checkConfig } = require('../src/config');

const MOIS = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const jours = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

async function connect() {
  const e = process.env;
  if (!e.SEDIT_HOST || !e.SEDIT_USER || !e.SEDIT_PASSWORD) throw new Error('Paramètres SEDIT absents (SEDIT_HOST, SEDIT_PORT, SEDIT_SERVICE, SEDIT_USER, SEDIT_PASSWORD)');
  return src.loadOracle().getConnection({ user: e.SEDIT_USER, password: e.SEDIT_PASSWORD, connectString: `${e.SEDIT_HOST}:${e.SEDIT_PORT || 1527}/${e.SEDIT_SERVICE || 'SMPROD'}` });
}

async function run(conn, { appliquer = false } = {}) {
  const depuis = config.repriseDepuis;
  const ech = await db.all(
    `SELECT e.id, e.periode_debut, e.montant_total, e.date_mandatement, e.statut, e.mandat_numero,
            (SELECT array_agg(ct.tiers_sedit_roo) FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id
              WHERE cc.contrat_id = e.contrat_id AND ct.tiers_sedit_roo IS NOT NULL) AS roos
     FROM ${t('echeances')} e WHERE e.statut IN ('mandatee','emise') AND e.periode_debut >= $1`, [depuis]);
  const cibles = ech.filter((e) => e.roos?.length);
  const stats = { echeances: ech.length, sans_tiers_rapproche: ech.length - cibles.length, exact: 0, probable: 0, ambigu: 0, introuvable: 0 };
  if (!cibles.length) return { stats };

  const roos = [...new Set(cibles.flatMap((e) => e.roos))];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis)) throw new Error('LOCATIF_REPRISE_DEPUIS invalide');
  const lignes = await src.rows(conn,
    `SELECT TRIM(TIERS) AS TIERS, MANDAT, TO_CHAR(DATMANDAT,'YYYY-MM-DD') AS DM, BORDEREAU, LIBELLE, MONTANTTC_E AS MT FROM FI.MVTLIGNE
     WHERE TRIM(TIERS) IN (${roos.map((_, i) => ':' + (i + 1)).join(',')}) AND DATMANDAT >= DATE '${depuis}'`, roos);
  const groupes = new Map();
  for (const l of lignes) {
    const k = `${l.TIERS}|${l.MANDAT}|${l.DM}`;
    if (!groupes.has(k)) groupes.set(k, { tiers: l.TIERS, mandat: l.MANDAT, dm: l.DM, bord: l.BORDEREAU, total: 0, libs: [] });
    const g = groupes.get(k); g.total += Number(l.MT || 0); g.libs.push(norm(l.LIBELLE));
  }
  const gl = [...groupes.values()];

  // Identifiants techniques des mandats (lien vers la fiche SEDIT) : un seul ROO par (n° de mandat, date), sinon pas de lien.
  const roosMandat = new Map();
  for (const m of await src.rows(conn, `SELECT TRIM(ROO_IMA_REF) AS ROO, MANDAT, TO_CHAR(DATMANDAT,'YYYY-MM-DD') AS DM FROM FI.MANDAT WHERE DATMANDAT >= DATE '${depuis}'`)) {
    const k = `${m.MANDAT}|${m.DM}`; roosMandat.set(k, roosMandat.has(k) ? null : m.ROO);
  }

  for (const e of cibles) {
    const d = new Date(`${e.periode_debut}T00:00:00Z`); const mot = `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const memeMontant = gl.filter((g) => e.roos.includes(g.tiers) && Math.abs(g.total - Number(e.montant_total)) < 0.011);
    const memeMois = memeMontant.filter((g) => g.libs.some((l) => l.includes(mot)));
    let choix = null; let confiance = null;
    if (memeMois.length === 1) { choix = memeMois[0]; confiance = 'exact'; }
    else {
      const pool = (memeMois.length ? memeMois : memeMontant).filter((g) => !e.date_mandatement || jours(g.dm, e.date_mandatement) <= 45);
      if (pool.length === 1) { choix = pool[0]; confiance = 'probable'; }
      else if (pool.length > 1) { stats.ambigu++; continue; }
    }
    if (!choix) { stats.introuvable++; continue; }
    stats[confiance]++;
    if (appliquer) {
      await db.run(
        `UPDATE ${t('echeances')} SET mandat_numero = $2, mandat_exercice = $3, mandat_date = $4, mandat_bordereau = $5, mandat_roo = $6, mandat_confiance = $7, mandat_verifie_le = now() WHERE id = $1`,
        [e.id, choix.mandat, Number(choix.dm.slice(0, 4)), choix.dm, choix.bord, roosMandat.get(`${choix.mandat}|${choix.dm}`) || null, confiance]);
    }
  }
  return { stats };
}

module.exports = { run };

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
