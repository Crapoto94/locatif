// États et statistiques (STA) : indicateurs annuels, état mensuel de facturation (rôle), exports Excel et PDF (STA-005).
const router = require('express').Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { httpError } = require('../../shared/http');

router.get('/annuel', requirePerm('etats.read'), async (req, res) => {
  const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
  const [rec, cr, ac, mensuel, types] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(montant_loyer),0) AS loyers, COALESCE(SUM(montant_charges),0) AS charges, COALESCE(SUM(montant_total),0) AS total
            FROM ${t('echeances')} WHERE statut <> 'annulee' AND EXTRACT(YEAR FROM periode_debut) = $1`, [annee]),
    db.get(`SELECT count(*)::int AS n FROM ${t('contrats')} WHERE EXTRACT(YEAR FROM COALESCE(date_signature, date_debut)) = $1`, [annee]),
    db.get(`SELECT count(*) FILTER (WHERE statut_code = 'en_cours')::int AS actifs, count(*) FILTER (WHERE EXTRACT(YEAR FROM date_cloture) = $1)::int AS clotures FROM ${t('contrats')}`, [annee]),
    db.all(`SELECT to_char(periode_debut,'YYYY-MM') AS periode, SUM(montant_loyer) AS loyers, SUM(montant_charges) AS charges FROM ${t('echeances')}
            WHERE statut <> 'annulee' AND EXTRACT(YEAR FROM periode_debut) = $1 GROUP BY 1 ORDER BY 1`, [annee]),
    db.all(`SELECT COALESCE(type_code,'(non renseigné)') AS type, count(*)::int AS nb FROM ${t('contrats')} WHERE statut_code = 'en_cours' GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  res.json({
    annee, nota: "Montants attendus / échéancés — ce ne sont pas des encaissements (STA-007).",
    recettes_attendues: rec, contrats_crees: cr.n, contrats_actifs: ac.actifs, contrats_clotures: ac.clotures, par_mois: mensuel, par_type: types,
  });
});

async function lignesMensuel(periode) {
  if (!/^\d{4}-\d{2}$/.test(periode || '')) throw httpError(400, 'Période attendue : AAAA-MM');
  return db.all(
    `SELECT k.numero, e.libelle, e.periode_debut, e.periode_fin, e.montant_loyer, e.montant_charges, e.montant_total, e.prorata, e.statut,
            (SELECT string_agg(ct.nom, ', ') FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = k.id) AS contractant,
            (SELECT string_agg(b.designation || COALESCE(' — ' || b.adresse,''), ' ; ') FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = k.id) AS bien
     FROM ${t('echeances')} e JOIN ${t('contrats')} k ON k.id = e.contrat_id
     WHERE e.statut <> 'annulee' AND NOT e.campagne_retiree AND to_char(e.periode_debut,'YYYY-MM') = $1 ORDER BY k.numero`, [periode]);
}

router.get('/mensuel', requirePerm('etats.read'), async (req, res) => {
  const lignes = await lignesMensuel(req.query.periode);
  res.json({ periode: req.query.periode, lignes, totaux: { loyers: lignes.reduce((s, l) => s + l.montant_loyer, 0), charges: lignes.reduce((s, l) => s + l.montant_charges, 0), total: lignes.reduce((s, l) => s + l.montant_total, 0) } });
});

router.get('/mensuel/export.xlsx', requirePerm('etats.read'), async (req, res) => {
  const lignes = await lignesMensuel(req.query.periode);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(`Rôle ${req.query.periode}`);
  ws.columns = [{ header: 'Contrat', key: 'numero', width: 16 }, { header: 'Contractant', key: 'contractant', width: 36 }, { header: 'Bien', key: 'bien', width: 48 },
    { header: 'Période', key: 'periode', width: 22 }, { header: 'Loyer', key: 'montant_loyer', width: 14 }, { header: 'Charges', key: 'montant_charges', width: 14 }, { header: 'Total', key: 'montant_total', width: 14 }, { header: 'Prorata', key: 'prorata', width: 9 }];
  ws.getRow(1).font = { bold: true };
  lignes.forEach((l) => ws.addRow({ ...l, periode: `${l.periode_debut} → ${l.periode_fin}`, prorata: l.prorata ? 'oui' : '' }));
  const tot = ws.addRow({ numero: 'TOTAL', montant_loyer: lignes.reduce((s, l) => s + l.montant_loyer, 0), montant_charges: lignes.reduce((s, l) => s + l.montant_charges, 0), montant_total: lignes.reduce((s, l) => s + l.montant_total, 0) });
  tot.font = { bold: true };
  ['E', 'F', 'G'].forEach((c) => { ws.getColumn(c).numFmt = '#,##0.00 "€"'; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="etat-mensuel-${req.query.periode}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

router.get('/mensuel/export.pdf', requirePerm('etats.read'), async (req, res) => {
  const lignes = await lignesMensuel(req.query.periode);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="etat-mensuel-${req.query.periode}.pdf"`);
  doc.pipe(res);
  doc.fontSize(14).text(`État mensuel de facturation locative — ${req.query.periode}`, { align: 'left' });
  doc.fontSize(8).fillColor('#555').text('Montants attendus / échéancés (hors encaissements).').moveDown(0.5).fillColor('#000');
  const cols = [['Contrat', 70], ['Contractant', 190], ['Bien', 280], ['Loyer', 70], ['Charges', 70], ['Total', 70]];
  const row = (vals, bold) => {
    if (doc.y > 540) doc.addPage();
    const y = doc.y; let x = 30; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    vals.forEach((v, i) => { doc.text(String(v ?? ''), x, y, { width: cols[i][1] - 4, height: 22, ellipsis: true, align: i >= 3 ? 'right' : 'left' }); x += cols[i][1]; });
    doc.y = y + 24;
  };
  row(cols.map((c) => c[0]), true);
  const eur = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  lignes.forEach((l) => row([l.numero, l.contractant, l.bien, eur(l.montant_loyer), eur(l.montant_charges), eur(l.montant_total)]));
  row(['TOTAL', '', '', eur(lignes.reduce((s, l) => s + l.montant_loyer, 0)), eur(lignes.reduce((s, l) => s + l.montant_charges, 0)), eur(lignes.reduce((s, l) => s + l.montant_total, 0))], true);
  doc.end();
});

module.exports = router;
