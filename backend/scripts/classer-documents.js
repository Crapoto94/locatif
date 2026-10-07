// Reclasse les documents existants par type (nom du fichier + type de pièce SEDIT déduit du commentaire).
//   node scripts/classer-documents.js [--tout]     (par défaut : uniquement les documents « autre » ou sans type)
const { db, t } = require('../src/db');
const { classer } = require('../src/modules/documents/classification');
const { seedAll } = require('../src/shared/seed');

(async () => {
  await seedAll(); // garantit la présence des nouveaux types dans le référentiel
  const tout = process.argv.includes('--tout');
  const docs = await db.all(`SELECT id, nom, type_code, commentaire FROM ${t('documents')} WHERE actif ${tout ? '' : "AND (type_code IS NULL OR type_code IN ('autre','piece_justificative'))"}`);
  const bilan = {}; let modifies = 0;
  for (const d of docs) {
    const type = classer({ nom: d.nom, commentaire: d.commentaire });
    bilan[type] = (bilan[type] || 0) + 1;
    if (type !== d.type_code) {
      const sens = type === 'rib' || type === 'piece_identite';
      await db.run(`UPDATE ${t('documents')} SET type_code = $2, sensible = sensible OR $3 WHERE id = $1`, [d.id, type, sens]);
      modifies++;
    }
  }
  console.log(JSON.stringify({ examines: docs.length, modifies, repartition: bilan }, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
