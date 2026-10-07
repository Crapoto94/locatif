// Vide les données issues de la reprise ASTECH (schéma locatif uniquement) avant de la relancer.
// Supprime aussi les fichiers des documents repris. Les comptes, droits, audit et paramétrages sont conservés.
const { db, t } = require('../src/db');
const store = require('../src/modules/documents/store/store');
(async () => {
  const docs = await db.all(`SELECT storage_key FROM ${t('documents')} WHERE astech_id IS NOT NULL`);
  for (const d of docs) await store.remove(d.storage_key).catch(() => {});
  for (const x of ['reprise_doublons', 'reprise_anomalies', 'reprise_runs', 'documents', 'echeances', 'revisions', 'conditions_financieres', 'depots_garantie', 'contrats', 'biens', 'contractants', 'indices_valeurs']) {
    await db.run(`DELETE FROM ${t(x)}`);
  }
  await db.run(`DELETE FROM ${t('ref_valeurs')} WHERE origine = 'astech'`);
  console.log(`Reprise réinitialisée (${docs.length} fichier(s) supprimé(s)).`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
