// Applique les migrations et les données initiales sans démarrer l'API.
const { checkConfig } = require('../src/config');
const { migrate } = require('../src/db');
const { seedAll } = require('../src/shared/seed');

(async () => { checkConfig(); await migrate(); await seedAll(); console.log('Migrations et données initiales appliquées.'); })()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => setTimeout(() => process.exit(), 200));
