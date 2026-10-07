// Reprise ASTECH en ligne de commande (lecture seule côté Oracle).
//   node scripts/import-astech.js [--env prod|test] [--documents] [--dry-run] [--discover]
const { checkConfig } = require('../src/config');
const { migrate } = require('../src/db');
const { seedAll } = require('../src/shared/seed');
const src = require('../src/modules/reprise/astech.source');
const importer = require('../src/modules/reprise/astech.import');
const { config } = require('../src/config');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

(async () => {
  checkConfig();
  const env = opt('env', config.astech.env);
  if (flag('discover')) { // affiche les colonnes réelles des tables sources, pour valider le mapping
    const conn = await src.connect(env);
    for (const tb of ['ARBO', 'ARBO_LOCATIF', 'ARBO_ADR', 'CONTRAT', 'CONTRAT_LOCATIF', 'CONTRAT_AFF', 'CONTRAT_RUB', 'CONTRAT_ECH', 'CONTRAT_ECHTERMINEE', 'CONTRAT_REVISION', 'INDICEINSEE', 'DOC', 'DOC_AFFECT']) {
      console.log(`\n${tb}\n  ${(await src.columns(conn, tb)).join(', ') || '(table absente)'}`);
    }
    await conn.close(); return;
  }
  await migrate(); await seedAll();
  const r = await importer.run({ env, documents: flag('documents'), dryRun: flag('dry-run'), user: 'script', log: (m) => console.log(`• ${m}`) });
  console.log(JSON.stringify({ run_id: r.run_id, dryRun: r.dryRun, anomalies: r.anomalies, objets: r.stats.objets, doublons: r.stats.doublons_detectes, documents: r.stats.documents }, null, 2));
})().catch((e) => { console.error('Échec de la reprise :', e.message); process.exit(1); }).finally(() => setTimeout(() => process.exit(), 200));
