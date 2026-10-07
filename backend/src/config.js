// Configuration centralisée : tout vient de l'environnement (.env), rien en dur.
const path = require('path');
const dotenv = require('dotenv');

// .env à la racine du dépôt (C:\dev\locatif\.env), puis backend/.env en surcharge éventuelle.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Même format que astech-explorer/config.example.json : { host, port, service_name, username, password } (+ oracle_test).
// Chemin par défaut : backend/config.json (ignoré par git) ; surcharge : ASTECH_CONFIG_JSON.
function readAstechJson() {
  try { return JSON.parse(require('fs').readFileSync(process.env.ASTECH_CONFIG_JSON || path.join(__dirname, '..', 'config.json'), 'utf8')); } catch { return {}; }
}
const aj = readAstechJson();
const fromJson = (o) => (o ? { host: o.host, port: o.port || 1523, service: o.service_name || o.service, user: o.username || o.user, password: o.password } : {});

const bool = (v, def = false) => (v === undefined || v === '' ? def : /^(1|true|yes|oui)$/i.test(String(v)));

const config = {
  port: parseInt(process.env.PORT || '3320', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3321,http://127.0.0.1:3321')
    .split(',').map((s) => s.trim()).filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtTtl: process.env.JWT_TTL || '8h',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',

  pg: {
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'ivry_admin',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    // Variable dédiée : le .env hérité d'autres applications contient PGC_SCHEMA, qui ne nous concerne pas.
    schema: (process.env.LOCATIF_SCHEMA || 'locatif').replace(/[^a-z0-9_]/gi, '').toLowerCase(),
  },

  apm: { url: process.env.APM_API_URL || 'https://api.ivry.local', key: process.env.APM_API_KEY || '' },
  hub: { url: process.env.HUBDSI_API_URL || '', key: process.env.HUBDSI_API_KEY || '' },
  allowSelfSigned: bool(process.env.VILLE_ALLOW_SELF_SIGNED_CERTS),

  // Compte administrateur local (ADM-011) — complément de l'AD, paramétré dans le .env.
  localAdmin: {
    enabled: bool(process.env.LOCAL_ADMIN_ENABLED, true),
    username: (process.env.LOCAL_ADMIN_USERNAME || 'admin').toLowerCase(),
    password: process.env.LOCAL_ADMIN_PASSWORD || 'admin',
  },

  scheduler: {
    // Variables dédiées (le .env hérité d'autres applications définit SCHEDULER_ENABLED pour elles).
    enabled: bool(process.env.LOCATIF_SCHEDULER_ENABLED, false),
    heure: parseInt(process.env.LOCATIF_SCHEDULER_HOUR || '6', 10),
  },

  storage: {
    // Valeurs initiales ; le paramétrage de /admin/ged (table ged_config) prime.
    filerRoot: process.env.STORAGE_FILER_ROOT || path.join(__dirname, '..', 'storage'),
    secret: process.env.STORAGE_SECRET || process.env.JWT_SECRET || 'locatif-dev-secret',
  },

  astech: {
    env: (process.env.ASTECH_ENV || 'prod').toLowerCase(),
    clientLibDir: process.env.ORACLE_CLIENT_LIB_DIR || 'C:/dev/astech-explorer/instantclient/instantclient_21_23',
    prod: process.env.ORACLE_ASTECH_HOST ? {
      host: process.env.ORACLE_ASTECH_HOST, port: process.env.ORACLE_ASTECH_PORT || 1523,
      service: process.env.ORACLE_ASTECH_SERVICE, user: process.env.ORACLE_ASTECH_USER,
      password: process.env.ORACLE_ASTECH_PASSWORD,
    } : fromJson(aj.host ? aj : aj._prod),
    test: process.env.ORACLE_ASTECH_TEST_HOST ? {
      host: process.env.ORACLE_ASTECH_TEST_HOST, port: process.env.ORACLE_ASTECH_TEST_PORT || 1523,
      service: process.env.ORACLE_ASTECH_TEST_SERVICE, user: process.env.ORACLE_ASTECH_TEST_USER,
      password: process.env.ORACLE_ASTECH_TEST_PASSWORD,
    } : fromJson(aj.oracle_test || aj.test || aj._test),
  },

  // Reprise : on ne garde que les données datées de cette date (incluse) ou postérieures.
  repriseDepuis: process.env.LOCATIF_REPRISE_DEPUIS || '2022-01-01',

  // Ouverture d'une fiche dans SEDIT (même schéma que AppDSI : <base>/<page>?<param>=<ROO_IMA_REF>). Page/param à vérifier sur votre SEDIT.
  sedit: { url: (process.env.SEDIT_URL || 'https://seditgfprod.ivry.local/SeditGfSMProd').replace(/\/$/, ''),
    pageTiers: process.env.SEDIT_URL_TIERS_PAGE || 'FicheTiers.html', paramTiers: process.env.SEDIT_URL_TIERS_PARAM || 'tiersId',
    // Fiche mandat : même page que celle utilisée par AppDSI.
    pageMandat: process.env.SEDIT_URL_MANDAT_PAGE || 'FicheMandat.html', paramMandat: process.env.SEDIT_URL_MANDAT_PARAM || 'mandatId' },

  sofficePath: process.env.SOFFICE_PATH || '',
  mailFooter: {
    footer1: process.env.MAIL_FOOTER1 || "Ville d'Ivry-sur-Seine",
    footer2: process.env.MAIL_FOOTER2 || 'Gestion locative',
    footer3: process.env.MAIL_FOOTER3 || '',
    footerColor: process.env.MAIL_FOOTER_COLOR || '#0f2a66',
  },
};

config.isProd = config.nodeEnv === 'production';

function checkConfig() {
  // Garde-fou : on ne travaille que dans un schéma qui nous est propre, jamais dans celui d'une autre application.
  if (!/^locatif[a-z0-9_]*$/.test(config.pg.schema)) {
    throw new Error(`Schéma PostgreSQL « ${config.pg.schema} » refusé : il doit commencer par « locatif » (variable LOCATIF_SCHEMA)`);
  }
  const missing = [];
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.pg.host) missing.push('POSTGRES_HOST');
  if (!config.pg.user) missing.push('POSTGRES_USER');
  if (missing.length) throw new Error(`Configuration incomplète (.env) : ${missing.join(', ')}`);
}

module.exports = { config, checkConfig };
