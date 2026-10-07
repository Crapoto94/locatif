// Rapproche les contractants des tiers SEDIT (FI.TIERS, lecture seule) pour renseigner l'identifiant tiers (CTN-008).
//   node scripts/rapprocher-tiers-sedit.js [--appliquer]        (sans --appliquer : simulation)
// Connexion : SEDIT_HOST / SEDIT_PORT / SEDIT_SERVICE / SEDIT_USER / SEDIT_PASSWORD (.env). Aucune écriture dans SEDIT.
// Règles : SIRET d'abord (9 premiers chiffres), puis nom exact (ordre des mots et accents ignorés).
// Une seule correspondance => rapproché ; plusieurs ou nom partiel => ambigu (à trancher à la main) ; sinon introuvable.
// Une saisie manuelle (tiers_sedit_statut = 'manuel') n'est jamais écrasée.
const { db, t } = require('../src/db');
const src = require('../src/modules/reprise/astech.source');
const audit = require('../src/services/audit');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const cle = (s) => norm(s).split(' ').filter(Boolean).sort().join(' ');

async function connect() {
  const ora = src.loadOracle();
  const e = process.env;
  if (!e.SEDIT_HOST || !e.SEDIT_USER || !e.SEDIT_PASSWORD) throw new Error('Paramètres SEDIT absents (SEDIT_HOST, SEDIT_PORT, SEDIT_SERVICE, SEDIT_USER, SEDIT_PASSWORD)');
  return ora.getConnection({ user: e.SEDIT_USER, password: e.SEDIT_PASSWORD, connectString: `${e.SEDIT_HOST}:${e.SEDIT_PORT || 1527}/${e.SEDIT_SERVICE || 'SMPROD'}` });
}

async function run(conn, { appliquer = false, user = 'script' } = {}) {
  // POBJ_EXTRACT = « code | nom | … | SIRET | … » séparé par CHR(1)
  const rows = await src.rows(conn, `SELECT TRIM(TIERS) AS TIERS, POBJ_EXTRACT AS EXT FROM FI.TIERS`);
  const parSiren = new Map(); const parNom = new Map(); const tiers = [];
  for (const r of rows) {
    const p = String(r.EXT || '').split('\u0001').map((x) => x.trim());
    const nom = p[1] || ''; const siret = (p[4] || '').replace(/\s/g, '');
    const o = { code: r.TIERS, nom, siret, cle: cle([p[1], p[3]].filter(Boolean).join(' ')) };
    tiers.push(o);
    if (/^\d{14}$/.test(siret)) (parSiren.get(siret.slice(0, 9)) || parSiren.set(siret.slice(0, 9), []).get(siret.slice(0, 9))).push(o);
    for (const k of new Set([cle(p[1]), o.cle])) if (k) (parNom.get(k) || parNom.set(k, []).get(k)).push(o);
  }
  const contractants = await db.all(`SELECT id, nom, prenom, siren, tiers_sedit_id, tiers_sedit_statut FROM ${t('contractants')}`);
  const stats = { rapproche: 0, ambigu: 0, introuvable: 0, deja: 0, manuel: 0 }; const detail = [];

  for (const c of contractants) {
    if (c.tiers_sedit_statut === 'manuel') { stats.manuel++; continue; }
    let cands = []; let via = '';
    if (c.siren && parSiren.has(c.siren)) { cands = parSiren.get(c.siren); via = 'SIRET'; }
    if (!cands.length) { cands = parNom.get(cle([c.nom, c.prenom].filter(Boolean).join(' '))) || parNom.get(cle(c.nom)) || []; via = 'nom exact'; }
    const uniques = [...new Map(cands.map((x) => [x.code, x])).values()];
    let statut; let code = null; let note;
    if (uniques.length === 1) { statut = 'rapproche'; code = uniques[0].code; note = `${via} → ${uniques[0].nom}`; }
    else if (uniques.length > 1) { statut = 'ambigu'; note = `${uniques.length} tiers (${via}) : ${uniques.slice(0, 5).map((x) => `${x.code} ${x.nom}`).join(' ; ')}`; }
    else {
      // Nom partiel : on le signale seulement, jamais d'écriture automatique.
      const mots = new Set(cle(c.nom).split(' ').filter((w) => w.length > 2));
      const proches = mots.size >= 2 ? tiers.filter((x) => { const m = new Set(x.cle.split(' ')); return [...mots].every((w) => m.has(w)); }).slice(0, 5) : [];
      statut = proches.length ? 'ambigu' : 'introuvable';
      note = proches.length ? `Nom partiel : ${proches.map((x) => `${x.code} ${x.nom}`).join(' ; ')}` : null;
    }
    stats[statut]++; detail.push({ id: c.id, nom: c.nom, statut, code, note });
    if (appliquer) {
      await db.run(`UPDATE ${t('contractants')} SET tiers_sedit_id = COALESCE($2, tiers_sedit_id), tiers_sedit_statut = $3, tiers_sedit_note = $4, updated_at = now() WHERE id = $1`, [c.id, code, statut, note]);
      if (code && code !== c.tiers_sedit_id) await audit.log(user, 'contractant.tiers_sedit_rapproche', 'contractant', c.id, { champ: 'tiers_sedit_id', ancienne: c.tiers_sedit_id, nouvelle: code, motif: note });
    }
  }
  return { stats, detail, tiers_sedit: tiers.length };
}

module.exports = { run };

if (require.main === module) {
  const { checkConfig } = require('../src/config');
  (async () => {
    checkConfig();
    const conn = await connect();
    const r = await run(conn, { appliquer: process.argv.includes('--appliquer') });
    console.log(JSON.stringify({ tiers_sedit: r.tiers_sedit, ...r.stats, appliquer: process.argv.includes('--appliquer') }));
    await conn.close(); process.exit(0);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
