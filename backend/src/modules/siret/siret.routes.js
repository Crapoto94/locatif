// Vérification des SIRET des contractants et liste des SIRET qui ne sont plus actifs.
const router = require('express').Router();
const ExcelJS = require('exceljs');
const { db, t } = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const svc = require('./siret.service');

router.post('/verifier', requirePerm('contractants.write'), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  res.json(await svc.verifier(req.user, ids));
});

const inactifs = () => db.all(
  `SELECT c.id, c.nom, c.prenom, c.siret, c.siret_statut, c.siret_fermeture_le, c.siret_denomination, c.siret_verifie_le, c.tiers_sedit_id,
          (SELECT count(*)::int FROM ${t('contrat_contractants')} cc JOIN ${t('contrats')} k ON k.id = cc.contrat_id WHERE cc.contractant_id = c.id AND k.statut_code = 'en_cours') AS contrats_actifs
   FROM ${t('contractants')} c WHERE c.siret_statut IN ('ferme','introuvable') ORDER BY (c.siret_statut = 'ferme') DESC, contrats_actifs DESC, c.nom`);

router.get('/inactifs', requirePerm('contractants.read'), async (req, res) => res.json(await inactifs()));

router.get('/inactifs.xlsx', requirePerm('contractants.read'), async (req, res) => {
  const rows = await inactifs();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('SIRET inactifs');
  ws.columns = [['Contractant', 'nom', 40], ['SIRET', 'siret', 18], ['Statut', 'statut', 14], ['Fermé le', 'fermeture', 13], ['Dénomination Sirene', 'denom', 38], ['Tiers SEDIT', 'tiers', 12], ['Contrats en cours', 'actifs', 16], ['Vérifié le', 'verifie', 18]]
    .map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow({ nom: `${r.nom}${r.prenom ? ` ${r.prenom}` : ''}`, siret: r.siret, statut: r.siret_statut === 'ferme' ? 'Fermé' : 'Introuvable', fermeture: r.siret_fermeture_le, denom: r.siret_denomination, tiers: r.tiers_sedit_id, actifs: r.contrats_actifs, verifie: r.siret_verifie_le ? new Date(r.siret_verifie_le).toLocaleString('fr-FR') : '' }));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="siret-inactifs.xlsx"');
  await wb.xlsx.write(res); res.end();
});

module.exports = router;
