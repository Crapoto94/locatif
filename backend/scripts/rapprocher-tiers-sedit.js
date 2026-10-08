// Rapproche les contractants des tiers SEDIT (FI.TIERS, lecture seule) pour renseigner l'identifiant tiers (CTN-008).
//   node scripts/rapprocher-tiers-sedit.js [--appliquer]        (sans --appliquer : simulation)
// Connexion : SEDIT_HOST / SEDIT_PORT / SEDIT_SERVICE / SEDIT_USER / SEDIT_PASSWORD (.env) ; à défaut, API centrale APM
// (/oracle/query, SELECT seul, type FINANCES). Aucune écriture dans SEDIT.
// Règles : 1) code tiers ASTECH (FOURNISSEUR.SFOU_COD) = code SEDIT quand il existe dans FI.TIERS (les codes ASTECH courts, ex. 14956,
// n'existent pas dans SEDIT : on passe alors à la suite) ; SEDIT peut porter plusieurs tiers sous un même code => départage par le nom ;
// 2) SIRET (9 premiers chiffres) ; 3) nom exact (ordre des mots et accents ignorés).
// Une seule correspondance => rapproché ; plusieurs ou nom partiel => ambigu (à trancher à la main) ; sinon introuvable.
// Une saisie manuelle (tiers_sedit_statut = 'manuel') n'est jamais écrasée.
const { db, t } = require('../src/db');
const src = require('../src/modules/reprise/astech.source');
const audit = require('../src/services/audit');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const cle = (s) => norm(s).split(' ').filter(Boolean).sort().join(' ');

// Repli sans Oracle direct : l'API centrale APM exécute le SELECT (type FINANCES).
async function apmSelect(sql) {
  const { config } = require('../src/config');
  const r = await fetch(`${config.apm.url.replace(/\/$/, '')}/api/v1/oracle/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': config.apm.key }, body: JSON.stringify({ type: 'FINANCES', sql }) });
  const b = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`APM ${r.status} : ${b?.error || 'réponse invalide'}`);
  return b;
}
const lire = (conn, sql) => (conn.apm ? apmSelect(sql) : src.rows(conn, sql));

async function connect() {
  const e = process.env;
  if (!e.SEDIT_HOST || !e.SEDIT_USER || !e.SEDIT_PASSWORD) return { apm: true, close: async () => {} };
  const ora = src.loadOracle();
  return ora.getConnection({ user: e.SEDIT_USER, password: e.SEDIT_PASSWORD, connectString: `${e.SEDIT_HOST}:${e.SEDIT_PORT || 1527}/${e.SEDIT_SERVICE || 'SMPROD'}` });
}

async function run(conn, { appliquer = false, user = 'script' } = {}) {
  // POBJ_EXTRACT = « code | nom | … | SIRET | … » séparé par CHR(1)
  const rows = await lire(conn, `SELECT TRIM(TIERS) AS TIERS, TRIM(ROO_IMA_REF) AS ROO, POBJ_EXTRACT AS EXT FROM FI.TIERS`);
  const parSiren = new Map(); const parNom = new Map(); const parCode = new Map(); const tiers = [];
  for (const r of rows) {
    const p = String(r.EXT || '').split('\u0001').map((x) => x.trim());
    const nom = p[1] || ''; const siret = (p[4] || '').replace(/\s/g, '');
    const o = { code: r.TIERS, roo: r.ROO, nom, siret, cle: cle([p[1], p[3]].filter(Boolean).join(' ')) };
    tiers.push(o);
    if (o.code) (parCode.get(o.code) || parCode.set(o.code, []).get(o.code)).push(o);
    if (/^\d{14}$/.test(siret)) (parSiren.get(siret.slice(0, 9)) || parSiren.set(siret.slice(0, 9), []).get(siret.slice(0, 9))).push(o);
    for (const k of new Set([cle(p[1]), o.cle])) if (k) (parNom.get(k) || parNom.set(k, []).get(k)).push(o);
  }
  const contractants = await db.all(`SELECT id, nom, prenom, siren, siret, astech_tiers_cod, tiers_sedit_id, tiers_sedit_statut FROM ${t('contractants')}`);
  const stats = { rapproche: 0, ambigu: 0, introuvable: 0, deja: 0, manuel: 0 }; const detail = [];

  for (const c of contractants) {
    if (c.tiers_sedit_statut === 'manuel') { stats.manuel++; continue; }
    let cands = []; let via = '';
    // 1) Code tiers ASTECH = code SEDIT. Plusieurs tiers sous le même code : on retient celui dont le nom correspond.
    const parCodeAstech = c.astech_tiers_cod ? parCode.get(String(c.astech_tiers_cod).trim()) || [] : [];
    if (parCodeAstech.length) {
      const motsC = new Set(cle([c.nom, c.prenom].filter(Boolean).join(' ')).split(' ').filter((w) => w.length > 2));
      const memeNom = parCodeAstech.filter((x) => { const m = new Set(`${cle(x.nom)} ${x.cle}`.split(' ')); const commun = [...motsC].filter((w) => m.has(w)).length; return commun > 0 && commun >= Math.min(motsC.size, 2); });
      cands = parCodeAstech.length === 1 ? parCodeAstech : memeNom;
      via = parCodeAstech.length === 1 ? `code ASTECH ${c.astech_tiers_cod}` : `code ASTECH ${c.astech_tiers_cod} + nom`;
      if (!cands.length) { cands = parCodeAstech; via = `code ASTECH ${c.astech_tiers_cod} (nom différent)`; }
    }
    const sirenC = c.siren || (c.siret ? c.siret.slice(0, 9) : null);
    if (!cands.length && sirenC && parSiren.has(sirenC)) { cands = parSiren.get(sirenC); via = 'SIRET'; }
    if (!cands.length) { cands = parNom.get(cle([c.nom, c.prenom].filter(Boolean).join(' '))) || parNom.get(cle(c.nom)) || []; via = 'nom exact'; }
    const uniques = [...new Map(cands.map((x) => [x.roo || x.code, x])).values()];
    let statut; let code = null; let roo = null; let note; let siretSedit = null; let candidats = null;
    const fiche = (x) => ({ code: x.code, roo: x.roo, nom: x.nom, siret: x.siret || null });
    if (uniques.length === 1) { statut = 'rapproche'; code = uniques[0].code; roo = uniques[0].roo; siretSedit = /^\d{14}$/.test(uniques[0].siret) ? uniques[0].siret : null; note = `${via} → ${uniques[0].nom}`; }
    else if (uniques.length > 1) { statut = 'ambigu'; candidats = uniques.slice(0, 10).map(fiche); note = `${uniques.length} tiers (${via}) : ${uniques.slice(0, 5).map((x) => `${x.code} ${x.nom}`).join(' ; ')}`; }
    else {
      // Nom partiel : on le signale seulement, jamais d'écriture automatique.
      const mots = new Set(cle(c.nom).split(' ').filter((w) => w.length > 2));
      const proches = mots.size >= 2 ? tiers.filter((x) => { const m = new Set(x.cle.split(' ')); return [...mots].every((w) => m.has(w)); }).slice(0, 5) : [];
      statut = proches.length ? 'ambigu' : 'introuvable'; if (proches.length) candidats = proches.map(fiche);
      note = proches.length ? `Nom partiel : ${proches.map((x) => `${x.code} ${x.nom}`).join(' ; ')}` : null;
    }
    stats[statut]++; detail.push({ id: c.id, nom: c.nom, statut, code, note });
    const rooVal = roo;
    if (appliquer) {
      await db.run(`UPDATE ${t('contractants')} SET tiers_sedit_id = COALESCE($2, tiers_sedit_id), tiers_sedit_roo = COALESCE($5, tiers_sedit_roo), siret = COALESCE(siret, $6), tiers_sedit_statut = $3, tiers_sedit_note = $4, tiers_sedit_candidats = $7, updated_at = now() WHERE id = $1`, [c.id, code, statut, note, rooVal, siretSedit, candidats ? JSON.stringify(candidats) : null]);
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
