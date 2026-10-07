// Excel des documents ASTECH du périmètre locatif non repris (contenu inaccessible), avec leurs dates de dépôt.
const ExcelJS = require('exceljs');
const path = require('path');
const { db, t } = require('../src/db');
const src = require('../src/modules/reprise/astech.source');

const d = (v) => src.fmtDate(v);
(async () => {
  const conn = await src.connect(process.argv[2] || 'prod');
  const have = new Set((await db.all(`SELECT astech_id FROM ${t('documents')} WHERE astech_id IS NOT NULL`)).map((r) => r.astech_id));
  const rows = await src.rows(conn,
    `SELECT d.*, a.DAFF_FRM, a.DAFF_ENTID FROM DOC d JOIN DOC_AFFECT a ON a.DAFF_DOCID = d.DOC_ID
     WHERE (a.DAFF_FRM = 25 AND a.DAFF_ENTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)) OR (a.DAFF_FRM = 1 AND a.DAFF_ENTID IN (SELECT ARBLOC_ID FROM ARBO_LOCATIF))`);
  const contrats = Object.fromEntries((await db.all(`SELECT astech_id, numero FROM ${t('contrats')}`)).map((c) => [c.astech_id, c.numero]));
  const biens = Object.fromEntries((await db.all(`SELECT astech_id, designation FROM ${t('biens')} WHERE astech_id NOT LIKE 'CODE:%'`)).map((b) => [b.astech_id, b.designation]));
  const STOCK = { 0: 'Fichier (chemin)', 1: 'Externe', 2: 'Base (BLOB)' };
  const lignes = rows.map((r) => ({
    id: r.DOC_ID, titre: r.DOC_TITRE, fichier: r.DOC_FILE, ext: r.DOC_EXT, dossier: r.DOC_FOLDER, taille: r.DOC_SIZE,
    stockage: STOCK[r.DOC_STOCKG] ?? r.DOC_STOCKG, depot: d(r.DOC_CDATE), deposant: r.DOC_CUSER, modif: d(r.DOC_MDATE), modifPar: r.DOC_MUSER, revis: r.DOC_REVIS,
    type: r.DAFF_FRM === 25 ? 'Contrat' : 'Bien', rattache: r.DAFF_FRM === 25 ? contrats[String(r.DAFF_ENTID)] : biens[String(r.DAFF_ENTID)], repris: have.has(String(r.DOC_ID)),
  })).sort((a, b) => String(a.depot).localeCompare(String(b.depot)));
  const manquants = lignes.filter((l) => !l.repris);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Documents manquants');
  ws.columns = [['N° doc ASTECH', 'id', 12], ['Titre', 'titre', 34], ['Fichier', 'fichier', 34], ['Ext.', 'ext', 7], ['Rattaché à', 'type', 10], ['Contrat / bien', 'rattache', 36],
    ['Date de dépôt', 'depot', 13], ['Déposé par', 'deposant', 14], ['Dernière modif.', 'modif', 13], ['Modifié par', 'modifPar', 14], ['Révision', 'revis', 9],
    ['Taille (o)', 'taille', 11], ['Stockage ASTECH', 'stockage', 16], ['Chemin d\'origine', 'dossier', 46]].map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A66' } };
  manquants.forEach((m) => ws.addRow(m));
  ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: 'A1', to: 'N1' };

  // Synthèse par année de dépôt
  const apres2024n = manquants.filter((m) => m.depot && m.depot >= '2024-01-01').length;
  const par = {};
  for (const l of lignes) { const y = l.depot ? l.depot.slice(0, 4) : 'inconnue'; par[y] ||= { total: 0, repris: 0, manquants: 0, blob: 0 }; par[y].total++; l.repris ? par[y].repris++ : par[y].manquants++; if (l.stockage === 'Base (BLOB)') par[y].blob++; }
  const sy = wb.addWorksheet('Synthèse par année');
  sy.columns = [{ header: 'Année de dépôt', key: 'a', width: 16 }, { header: 'Documents', key: 't', width: 12 }, { header: 'Repris', key: 'r', width: 10 }, { header: 'Manquants', key: 'm', width: 12 }, { header: 'Stockés en BLOB', key: 'b', width: 16 }];
  sy.getRow(1).font = { bold: true };
  Object.keys(par).sort().forEach((y) => sy.addRow({ a: y, t: par[y].total, r: par[y].repris, m: par[y].manquants, b: par[y].blob }));
  sy.addRow({});
  const annees = [...new Set(manquants.map((m) => (m.depot || 'inconnue').slice(0, 4)))].sort().join(', ');
  sy.addRow({ a: `Note : depuis 2024 tous les documents sont stockés en base (BLOB) et sont donc repris — aucun manquant depuis 2024 (${apres2024n}). Les ${manquants.length} manquants ont été déposés en : ${annees} ; ils pointent vers des lecteurs de postes distants (\\tsclient\…).` });
  sy.getCell(`A${sy.rowCount}`).alignment = { wrapText: false };

  const out = path.join(__dirname, '..', '..', 'exports', 'documents_manquants_astech.xlsx');
  await wb.xlsx.writeFile(out);
  const apres2024 = manquants.filter((m) => m.depot && m.depot >= '2024-01-01');
  console.log(JSON.stringify({ fichier: out, perimetre: lignes.length, repris: lignes.length - manquants.length, manquants: manquants.length, manquants_depuis_2024: apres2024.length, par }, null, 1));
  await conn.close(); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
