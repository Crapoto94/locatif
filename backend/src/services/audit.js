// Journal d'audit (AUD-001 à AUD-008) : ancienne / nouvelle valeur, utilisateur, date, motif.
const { db, t } = require('../db');

const str = (v) => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)));

async function log(user, evenement, entite, entiteId, extra = {}, runner = db) {
  await runner.run(
    `INSERT INTO ${t('audit_log')}(utilisateur, evenement, entite, entite_id, champ, ancienne_valeur, nouvelle_valeur, motif, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [user?.username || user || null, evenement, entite, entiteId === undefined ? null : String(entiteId),
      extra.champ || null, str(extra.ancienne), str(extra.nouvelle), extra.motif || null, extra.details ? JSON.stringify(extra.details) : null],
  );
}

// Compare deux objets sur une liste de champs et journalise chaque différence (CTR-012, CTR-ERR-001).
async function logDiff(user, evenement, entite, entiteId, avant, apres, champs, motif, runner = db) {
  for (const c of champs) {
    if (apres[c] === undefined) continue;
    if (str(avant?.[c]) !== str(apres[c])) {
      await log(user, evenement, entite, entiteId, { champ: c, ancienne: avant?.[c], nouvelle: apres[c], motif }, runner);
    }
  }
}

module.exports = { log, logDiff };
