// Importe dans l'application les pièces SEDIT rattachées aux tiers rapprochés (FI.FIPES_OBJ_PJ, OBJECT_TYPE = 'TIERS').
//   node scripts/importer-docs-sedit.js [--dry-run] [--avec-rib]
// - Lecture seule côté SEDIT ; le contenu est lu sur le partage UNC indiqué par PJ_PES.CHEMIN_FICHIER (le poste doit y avoir accès).
// - Les relevés d'identité bancaire (type 7) et pièces d'identité ne sont repris que sur demande explicite (--avec-rib) ;
//   ils sont alors marqués sensibles (accès restreint aux profils habilités, consultations tracées).
// - Idempotent (astech_id = 'sedit:<ROO de la pièce>'), seules les pièces créées à partir de LOCATIF_REPRISE_DEPUIS sont reprises.
const fs = require('fs');
const path = require('path');
const { config, checkConfig } = require('../src/config');
const { db, t } = require('../src/db');
const src = require('../src/modules/reprise/astech.source');
const docs = require('../src/modules/documents/documents.service');
const { classer } = require('../src/modules/documents/classification');

const MIME = { '.pdf': 'application/pdf', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const TYPES = { 70: ['contrat', 'Contrat ou convention'], 69: ['deliberation', 'Délibération, arrêté, décision'], 221: ['autre', 'Autres pièces justificatives tiers'], 5: ['autre', 'Titre'] };
const SENSIBLE = /\b(RIB|IBAN|BIC)\b|identit|passeport|\bCNI\b|titre de s[ée]jour/i;
const MAX = 50 * 1024 * 1024;

async function connect() {
  const e = process.env;
  if (!e.SEDIT_HOST || !e.SEDIT_USER || !e.SEDIT_PASSWORD) throw new Error('Paramètres SEDIT absents (SEDIT_HOST, SEDIT_PORT, SEDIT_SERVICE, SEDIT_USER, SEDIT_PASSWORD)');
  return src.loadOracle().getConnection({ user: e.SEDIT_USER, password: e.SEDIT_PASSWORD, connectString: `${e.SEDIT_HOST}:${e.SEDIT_PORT || 1527}/${e.SEDIT_SERVICE || 'SMPROD'}` });
}

async function run(conn, { dryRun = false, user = 'script-sedit', avecRib = false } = {}) {
  const stats = { pieces: 0, importees: 0, deja: 0, sensibles_ecartees: 0, avant_coupure: 0, fichier_inaccessible: 0, trop_volumineux: 0, erreurs: 0 };
  const erreurs = [];
  const tiers = await db.all(`SELECT id, nom, tiers_sedit_roo AS roo FROM ${t('contractants')} WHERE tiers_sedit_roo IS NOT NULL`);
  for (const c of tiers) {
    const pj = await src.rows(conn,
      `SELECT TRIM(p.ROO_IMA_REF) AS ROO, p.NOM_PJ, p.CHEMIN_FICHIER, p.TYPE_PIECE_ID, p.DATE_CREAT, p.TAILLE
       FROM FI.FIPES_OBJ_PJ l JOIN FI.PJ_PES p ON p.ROO_IMA_REF = l.PJPES_ROO WHERE l.OBJECT_TYPE = 'TIERS' AND TRIM(l.OBJECT_ROO) = :r`, [c.roo]);
    for (const p of pj) {
      stats.pieces++;
      const sensiblePiece = Number(p.TYPE_PIECE_ID) === 7 || SENSIBLE.test(p.NOM_PJ || '') || SENSIBLE.test(p.CHEMIN_FICHIER || '');
      if (sensiblePiece && !avecRib) { stats.sensibles_ecartees++; continue; }
      if (src.fmtDate(p.DATE_CREAT) < config.repriseDepuis) { stats.avant_coupure++; continue; }
      const key = `sedit:${p.ROO}`;
      const ex = await db.get(`SELECT id FROM ${t('documents')} WHERE astech_id = $1`, [key]);
      if (ex) { await docs.addLinks(db, ex.id, [{ objet_type: 'contractant', objet_id: c.id }]); stats.deja++; continue; }
      const chemin = String(p.CHEMIN_FICHIER || '');
      try {
        const st = fs.statSync(chemin);
        if (st.size > MAX) { stats.trop_volumineux++; continue; }
        if (dryRun) { stats.importees++; continue; }
        const buffer = fs.readFileSync(chemin);
        const ext = path.extname(chemin).toLowerCase() || (p.FORMAT === '06' ? '.pdf' : '');
        const nom = /\.[a-z0-9]{2,4}$/i.test(p.NOM_PJ || '') ? p.NOM_PJ : `${p.NOM_PJ || path.basename(chemin, ext)}${ext}`;
        const libType = (TYPES[Number(p.TYPE_PIECE_ID)] || [null, Number(p.TYPE_PIECE_ID) === 7 ? "Relevé d'identité bancaire" : `Type SEDIT ${p.TYPE_PIECE_ID}`])[1];
        const type_code = classer({ nom, typeSedit: Number(p.TYPE_PIECE_ID) });
        await docs.create({ username: user }, { buffer, nom, mime: MIME[ext] || null, type_code, sensible: sensiblePiece || undefined, astech_id: key,
          links: [{ objet_type: 'contractant', objet_id: c.id }], commentaire: `Pièce SEDIT du tiers — ${libType}` });
        stats.importees++;
      } catch (e) {
        if (['ENOENT', 'EACCES', 'EPERM', 'ENOTFOUND', 'EBUSY'].includes(e.code)) stats.fichier_inaccessible++; else { stats.erreurs++; erreurs.push(`${c.nom} / ${p.NOM_PJ} : ${e.message}`); }
      }
    }
  }
  return { stats, erreurs, tiers: tiers.length };
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    checkConfig();
    const conn = await connect();
    const r = await run(conn, { dryRun: process.argv.includes('--dry-run'), avecRib: process.argv.includes('--avec-rib') });
    console.log(JSON.stringify({ tiers: r.tiers, ...r.stats, erreurs: r.erreurs.slice(0, 5) }, null, 1));
    await conn.close(); process.exit(0);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
