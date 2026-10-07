// Reprise des données du module Gestion locative d'ASTECH (MIG-001 à MIG-013).
// - Idempotent : clé = identifiant historique ASTECH (astech_id) ; une relance complète les champs vides et ne réécrase pas les corrections saisies.
// - Aucune fusion destructive : les doublons probables sont signalés (reprise_doublons) et examinés par les utilisateurs.
// - Les noms de colonnes non documentés sont résolus par convention (pick) ; le rapport liste ce qui a été utilisé.
const fs = require('fs');
const path = require('path');
const { db, t } = require('../../db');
const src = require('./astech.source');
const docs = require('../documents/documents.service');
const { config } = require('../../config');

const { fmtDate, num, str, pick, pickKey, raw } = src;
const TYPES_INDICE = { 1: 'IRL', 2: 'ICC', 5: 'ILC', 6: 'ILAT' };
const FORMES = /\b(SARL|SAS|SASU|SCI|SCM|SA|EURL|SNC|ASSOC\w*|SOCIETE|SOCIÉTÉ|CABINET|COMITE|COMITÉ|CENTRE|UNION|FEDERATION|FÉDÉRATION|CLUB|ECOLE|ÉCOLE|MUTUELLE|FONDATION|SYNDICAT|COOPERATIVE|COOPÉRATIVE|GROUPE|ETS|ETABLISSEMENTS)\b/i;
// Codes ASTECH connus ; les autres restent sous leur code (aucun libellé n'existe dans ASTECH — à valider par AFLC).
const TYPES_CONTRAT = { BAIL89: ['bail_habitation_89', "Bail d'habitation (loi 89)"], BAILCC: ['bailcc', 'Bail commercial (BAILCC — à valider)'],
  AOT: ['aot', "Autorisation d'occupation temporaire (AOT — à valider)"], COP: ['cop', "Convention d'occupation précaire (COP — à valider)"], ZZZ: ['zzz', 'Non qualifié (ZZZ)'] };
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function typeBien(libelle) {
  const s = norm(libelle);
  const map = [['PARKING', 'parking'], ['GARAGE', 'garage'], ['CAVE', 'cave'], ['TERRAIN', 'terrain'], ['ENTREPOT', 'entrepot'], ['MAISON', 'maison'], ['PAVILLON', 'maison'],
    ['ASSOCIAT', 'local_associatif'], ['COMMERC', 'local_commercial'], ['BOUTIQUE', 'local_commercial'], ['BUREAU', 'bureau'], ['LOGEMENT', 'logement'], ['APPARTEMENT', 'logement']];
  return (map.find(([k]) => s.includes(k)) || [null, 'autre'])[1];
}

async function ensureRef(tx, domaine, code, libelle) {
  await tx.run(`INSERT INTO ${t('ref_valeurs')}(domaine, code, libelle, ordre, origine) VALUES ($1,$2,$3,900,'astech') ON CONFLICT (domaine, code) DO NOTHING`, [domaine, code, libelle || code]);
}

// Upsert par astech_id : crée ou complète les champs vides, rafraîchit astech_raw. Retourne { id, created }.
async function upsert(tx, table, data, fillable) {
  const cols = Object.keys(data);
  const sets = [...fillable.map((c) => `${c} = COALESCE(${t(table)}.${c}, EXCLUDED.${c})`), 'astech_raw = EXCLUDED.astech_raw'].filter((s) => cols.includes(s.split(' ')[0]) || s.startsWith('astech_raw'));
  const r = await tx.get(
    `INSERT INTO ${t(table)}(${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
     ON CONFLICT (astech_id) DO UPDATE SET ${sets.join(', ')} RETURNING id, (xmax = 0) AS created`, cols.map((c) => (c === 'astech_raw' ? JSON.stringify(data[c]) : data[c])));
  return r;
}

async function lookupMap(conn, table, keyPatterns, labelPatterns) {
  const out = new Map();
  if (!(await src.tableExists(conn, table))) return out;
  for (const r of await src.rows(conn, `SELECT * FROM ${table}`)) {
    const k = pick(r, ...keyPatterns); const l = pick(r, ...labelPatterns);
    if (k !== null) out.set(String(k), str(l));
  }
  return out;
}

async function run({ env = 'prod', documents = false, dryRun = false, user = 'script', log = () => {} }) {
  const job = await db.get(`INSERT INTO ${t('reprise_runs')}(environnement, options, utilisateur) VALUES ($1,$2,$3) RETURNING *`, [env, JSON.stringify({ documents, dryRun }), user]);
  const stats = { source: {}, objets: {}, mapping: {}, documents: null };
  const anomalies = [];
  const warn = (objet, reference, message, niveau = 'warning') => anomalies.push({ niveau, objet, reference: reference ? String(reference) : null, message });
  const count = (o, k) => { stats.objets[o] ||= { lus: 0, crees: 0, mis_a_jour: 0, rejetes: 0 }; stats.objets[o][k]++; };
  let conn;
  try {
    log(`Connexion à ASTECH (${env})…`);
    conn = await src.connect(env);
    for (const tb of ['ARBO_LOCATIF', 'CONTRAT_LOCATIF', 'CONTRAT_ECH', 'CONTRAT_ECHTERMINEE', 'CONTRAT_REVISION', 'INDICEINSEE']) {
      stats.source[tb] = (await src.rows(conn, `SELECT COUNT(*) AS N FROM ${tb}`))[0].N;
    }
    log('Lecture des tables sources…');
    let [indRows, arbLoc, arbo, adr, contrat, contLoc, aff, affl, rub, ech, echHist, revs] = await Promise.all([
      src.rows(conn, 'SELECT * FROM INDICEINSEE'),
      src.rows(conn, 'SELECT * FROM ARBO_LOCATIF'),
      src.rows(conn, 'SELECT * FROM ARBO WHERE ARB_ID IN (SELECT ARBLOC_ID FROM ARBO_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM ARBO_ADR WHERE ARBA_ID IN (SELECT ARBLOC_ID FROM ARBO_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT WHERE CONT_ID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_LOCATIF'),
      src.rows(conn, 'SELECT * FROM CONTRAT_AFF WHERE CONTAF_ID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_AFFL WHERE CONTAFL_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      (await src.tableExists(conn, 'CONTRAT_RUB')) ? src.rows(conn, 'SELECT * FROM CONTRAT_RUB') : [],
      src.rows(conn, 'SELECT * FROM CONTRAT_ECH WHERE CONTEC_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_ECHTERMINEE WHERE CONTEC_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_REVISION WHERE CONTRV_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
    ]);
    // ---------- Filtre de date (LOCATIF_REPRISE_DEPUIS, défaut 2022-01-01) ----------
    const CUT = config.repriseDepuis; const CUT_AN = Number(CUT.slice(0, 4));
    const locByContId = new Map(contLoc.map((r) => [String(r.CONTL_ID), r]));
    const derniereEch = new Map();
    // Activité réelle : seules les échéances ÉMISES (historique) comptent ; le prévisionnel et les dates de clôture administrative
    // (reprise 2024) ne prouvent aucune activité.
    for (const r of echHist) {
      const k = String(r.CONTEC_CONTID); const d = fmtDate(r.CONTEC_DATEDEB) || fmtDate(r.CONTEC_DATE);
      if (d && (!derniereEch.get(k) || d > derniereEch.get(k))) derniereEch.set(k, d);
    }
    // Un contrat est conservé s'il est en cours, ou si sa dernière date connue (fin, sortie, clôture, dernière échéance) est >= CUT ; sans aucune date, on le garde.
    const gardes = new Set();
    for (const r of contrat) {
      const l = locByContId.get(String(r.CONT_ID)) || {};
      const dates = [fmtDate(r.CONT_DATFIN), fmtDate(l.CONTL_DATSORTIE), derniereEch.get(String(r.CONT_ID))].filter(Boolean).sort();
      if (String(r.CONT_ACTIF || '').toUpperCase() === 'O' || (dates.length && dates[dates.length - 1] >= CUT)) gardes.add(String(r.CONT_ID));
    }
    stats.filtre = { depuis: CUT, contrats_ecartes: contrat.length - gardes.size };
    contrat = contrat.filter((r) => gardes.has(String(r.CONT_ID)));
    contLoc = contLoc.filter((r) => gardes.has(String(r.CONTL_ID)));
    aff = aff.filter((r) => gardes.has(String(r.CONTAF_ID)));
    affl = affl.filter((r) => gardes.has(String(r.CONTAFL_CONTID)));
    // Récursif : un bien n'est repris que s'il est rattaché à un contrat conservé.
    const biensGardes = new Set(aff.map((r) => String(r.CONTAF_ARBID)));
    stats.filtre.biens_ecartes = arbo.length - arbo.filter((r) => biensGardes.has(String(r.ARB_ID))).length;
    arbo = arbo.filter((r) => biensGardes.has(String(r.ARB_ID)));
    ech = ech.filter((r) => gardes.has(String(r.CONTEC_CONTID)) && (fmtDate(r.CONTEC_DATEDEB) || fmtDate(r.CONTEC_DATE) || '') >= CUT);
    echHist = echHist.filter((r) => gardes.has(String(r.CONTEC_CONTID)) && (fmtDate(r.CONTEC_DATEDEB) || fmtDate(r.CONTEC_DATE) || '') >= CUT);
    revs = revs.filter((r) => gardes.has(String(r.CONTRV_CONTID)) && (fmtDate(r.CONTRV_DATAPPLI) || fmtDate(r.CONTRV_DAT) || '') >= CUT);
    // Indices : ceux de l'année de coupure et après, plus ceux encore référencés (indice de référence d'un contrat conservé).
    const refs = new Set([...revs.flatMap((r) => [r.CONTRV_INSEE, r.CONTRV_INSEEP]), ...contLoc.flatMap((l) => [l.CONTL_INSEE, l.CONTL_INSEEDEP])].filter((x) => x !== null && x !== undefined).map(String));
    indRows = indRows.filter((r) => num(r.INSEE_AN) >= CUT_AN || refs.has(String(r.INSEE_ID)));

    const genres = await lookupMap(conn, 'PATRIGENE', ['SGEN_COD'], ['SGEN_DES']);
    const cats = await lookupMap(conn, 'CATEGORIE', ['SCAT_COD', 'SCAT_ID', 'SCAT_CODE'], ['SCAT_DES']);
    const scats = await lookupMap(conn, 'SOUSCATEGORIE', ['SSCAT_COD', 'SSCAT_ID', 'SSCAT_CODE'], ['SSCAT_DES']);

    const hier = new Map((await src.rows(conn, "SELECT ARB_ID, ARB_CODE, ARB_DES, ARB_NOMC, ARB_GENRE, ARB_SUP, ARB_CAT, ARB_SSERV FROM ARBO WHERE ARB_CODE LIKE 'S%'")).map((r) => [String(r.ARB_ID), r]));
    const adrNoeuds = new Map((await src.rows(conn, "SELECT * FROM ARBO_ADR WHERE ARBA_ID IN (SELECT ARB_ID FROM ARBO WHERE ARB_GENRE IN ('SITE','BAT') AND ARB_CODE LIKE 'S%')")).map((r) => [String(r.ARBA_ID), r]));
    const ligEch = await src.rows(conn, "SELECT CONTEL_ECHID, CONTEL_CONTID, CONTEL_DES, CONTEL_RUBID, CONTEL_MTTC, CONTEL_MTHT_NOPRORATA, CONTEL_NBJ_EFF, CONTEL_NBJ_PER, CONTEL_CHARGEAV, CONTEL_CHARGE, CONTEL_CHARGEREGUL FROM CONTRAT_ECHLIGNE WHERE CONTEL_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)");
    const result = await db.tx(async (tx) => {
      // ---------- 1. Indices ----------
      const indMap = new Map(); // INSEE_ID -> { id, type }
      for (const r of indRows) {
        count('indices', 'lus');
        const typ = TYPES_INDICE[num(r.INSEE_TYP)] || `IDX${num(r.INSEE_TYP)}`;
        await ensureRef(tx, 'type_indice', typ, typ);
        const trim = num(r.INSEE_TRIM) || Math.ceil((num(r.INSEE_MOIS) || 1) / 3);
        try {
          await tx.run('SAVEPOINT ind');
          const x = await tx.get(
            `INSERT INTO ${t('indices_valeurs')}(type_code, annee, trimestre, libelle, valeur, date_publication, astech_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (astech_id) DO UPDATE SET valeur = COALESCE(${t('indices_valeurs')}.valeur, EXCLUDED.valeur) RETURNING id, (xmax = 0) AS created`,
            [typ, num(r.INSEE_AN), trim, str(r.INSEE_DES), num(r.INSEE_TAUX), fmtDate(r.INSEE_DATP), String(r.INSEE_ID)]);
          indMap.set(String(r.INSEE_ID), { id: x.id, type: typ });
          count('indices', x.created ? 'crees' : 'mis_a_jour');
        } catch (e) {
          await tx.run('ROLLBACK TO SAVEPOINT ind');
          count('indices', 'rejetes');
          warn('indice', r.INSEE_ID, `Doublon (type, année, trimestre) ou valeur invalide : ${r.INSEE_DES || r.INSEE_COD} — ${e.message}`);
        }
      }

      // ---------- 2. Biens locatifs ----------
      const locByArb = new Map(arbLoc.map((r) => [String(r.ARBLOC_ID), r]));
      const adrByArb = new Map(adr.map((r) => [String(r.ARBA_ID), r]));
      const bienMap = new Map(); // ARB_ID -> id
      const sample = arbo[0]; const locSample = arbLoc[0] || {}; const adrSample = adr[0] || {};
      stats.mapping.biens = { ARBO: sample ? Object.keys(sample) : [], ARBO_LOCATIF: Object.keys(locSample), ARBO_ADR: Object.keys(adrSample) };
      for (const r of arbo) {
        count('biens', 'lus');
        const loc = locByArb.get(String(r.ARB_ID)) || {}; const a = adrByArb.get(String(r.ARB_ID)) || {};
        const genre = genres.get(String(r.ARB_GENRE)); const cat = cats.get(String(r.ARB_CAT)); const scat = scats.get(String(r.ARB_SCAT));
        const code = str(r.ARB_CODE);
        const adresse = [pick(a, /^ARBA_(NUMVOIE|NUM|NUMERO)$/), pick(a, /^ARBA_(ADR1?|RUE|VOIE|LIB\w*|ADRESSE)$/)].filter(Boolean).join(' ') || null;
        const data = {
          parent_id: null, niveau: 'unite', code, designation: str(r.ARB_DES) || str(r.ARB_NOMC) || code || `Bien ${r.ARB_ID}`,
          type_code: typeBien(`${genre || ''} ${cat || ''} ${scat || ''} ${r.ARB_DES || ''}`), categorie: [genre, cat, scat].filter(Boolean).join(' / ') || null,
          adresse: str(adresse), code_postal: str(pick(a, /^ARBA_(CP|CODPOST\w*|CODE_?POSTAL)$/)), ville: str(pick(a, /^ARBA_(VILLE|COMMUNE|LOCALITE)$/)),
          surface: num(pick(loc, /SURF/) ?? pick(r, /^ARB_(SURF\w*|SUP\w*)$/)), service_code: str(r.ARB_SSERV), astech_id: String(r.ARB_ID),
          astech_raw: { arbo: raw(r), locatif: raw(loc), adresse: raw(a) },
        };
        await ensureRef(tx, 'type_bien', data.type_code, data.type_code);
        const x = await upsert(tx, 'biens', data, ['code', 'designation', 'type_code', 'categorie', 'adresse', 'code_postal', 'ville', 'surface', 'service_code', 'parent_id']);
        bienMap.set(String(r.ARB_ID), x.id); count('biens', x.created ? 'crees' : 'mis_a_jour');
      }


      // ---------- 2b. Sites et bâtiments : référentiel patrimonial ASTECH (ARBO.ARB_GENRE = SITE / BAT, ARB_SUP = parent) ----------
      // Remplace la déduction à partir du code (S003B01…) : désignation, adresse, catégorie et service viennent d'ASTECH.
      const ancetres = (row) => {
        let cur = row; let bat = null; let site = null;
        for (let i = 0; i < 12 && cur; i++) {
          cur = hier.get(String(cur.ARB_SUP)); if (!cur) break;
          if (cur.ARB_GENRE === 'BAT' && !bat) bat = cur;
          if (cur.ARB_GENRE === 'SITE') { site = cur; break; }
        }
        return { bat, site };
      };
      const noeuds = new Map(bienMap); // ARB_ID -> id en base (les biens locatifs qui sont eux-mêmes bâtiment/site sont déjà là)
      async function ensureNoeud(row) {
        const k = String(row.ARB_ID); if (noeuds.has(k)) return noeuds.get(k);
        const niveau = row.ARB_GENRE === 'SITE' ? 'site' : 'batiment';
        const { site } = niveau === 'batiment' ? ancetres(row) : { site: null };
        const parentId = site ? await ensureNoeud(site) : null;
        const a = adrNoeuds.get(k) || (site ? adrNoeuds.get(String(site.ARB_ID)) : null) || {}; // un bâtiment sans adresse hérite de celle du site
        const adresse = [a.ARBA_NUMVOIE, a.ARBA_ADR1].map(str).filter(Boolean).join(' ') || null;
        const x = await tx.get(
          `INSERT INTO ${t('biens')}(code, designation, niveau, parent_id, categorie, adresse, code_postal, ville, service_code, astech_id, astech_raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (astech_id) DO UPDATE SET code = EXCLUDED.code, designation = EXCLUDED.designation, parent_id = EXCLUDED.parent_id,
             adresse = COALESCE(${t('biens')}.adresse, EXCLUDED.adresse), code_postal = COALESCE(${t('biens')}.code_postal, EXCLUDED.code_postal),
             ville = COALESCE(${t('biens')}.ville, EXCLUDED.ville), service_code = COALESCE(${t('biens')}.service_code, EXCLUDED.service_code), astech_raw = EXCLUDED.astech_raw
           RETURNING id, (xmax = 0) AS created`,
          [str(row.ARB_CODE), str(row.ARB_DES) || str(row.ARB_NOMC) || str(row.ARB_CODE), niveau, parentId, str(row.ARB_CAT), adresse, str(a.ARBA_CP), str(a.ARBA_VILLE), str(row.ARB_SSERV), k, JSON.stringify({ arbo: raw(row), adresse: raw(a) })]);
        noeuds.set(k, x.id); count(niveau === 'site' ? 'sites' : 'batiments', x.created ? 'crees' : 'mis_a_jour');
        return x.id;
      }
      for (const r of arbo) {
        const { bat, site } = ancetres(r);
        const parent = bat || site; const id = bienMap.get(String(r.ARB_ID));
        const parentId = parent ? await ensureNoeud(parent) : null;
        await tx.run(`UPDATE ${t('biens')} SET parent_id = $2, niveau = 'unite' WHERE id = $1`, [id, parentId]); // hiérarchie ASTECH : source de vérité
      }
      // Anciens sites / bâtiments déduits du code : supprimés dès qu'ils n'ont plus d'enfant.
      await tx.run(`DELETE FROM ${t('biens')} WHERE astech_id LIKE 'CODE:%' AND NOT EXISTS (SELECT 1 FROM ${t('biens')} f WHERE f.parent_id = ${t('biens')}.id)`);

      // ---------- 3. Contrats + contractants + liens ----------
      const locByCont = new Map(contLoc.map((r) => [String(r.CONTL_ID), r]));
      const lastRev = new Map(); // CONT_ID -> révision la plus récente
      for (const r of revs) { const k = String(r.CONTRV_CONTID); const cur = lastRev.get(k); if (!cur || num(r.CONTRV_ID) > num(cur.CONTRV_ID)) lastRev.set(k, r); }
      const contrMap = new Map(); const contractantMap = new Map();
      stats.mapping.contrats = { CONTRAT: contrat[0] ? Object.keys(contrat[0]) : [], CONTRAT_LOCATIF: contLoc[0] ? Object.keys(contLoc[0]) : [] };
      for (const r of contrat) {
        count('contrats', 'lus');
        const l = locByCont.get(String(r.CONT_ID)) || {};
        const statut = { O: 'en_cours', C: 'clos', N: 'divers' }[String(r.CONT_ACTIF || '').toUpperCase()] || 'divers';
        const rev = lastRev.get(String(r.CONT_ID));
        const refInd = (rev && indMap.get(String(rev.CONTRV_INSEE))) || indMap.get(String(l.CONTL_INSEEDEP)) || indMap.get(String(l.CONTL_INSEE)) || null;
        // Le type métier est CONTL_TYPCO (AOT, COP, BAIL89…) ; CONT_TYP vaut 6 pour tous les contrats locatifs.
        const typeRaw = str(l.CONTL_TYPCO);
        const typeCode = typeRaw ? (TYPES_CONTRAT[typeRaw.toUpperCase()]?.[0] || typeRaw.toLowerCase()) : null;
        if (typeCode) await ensureRef(tx, 'type_contrat', typeCode, TYPES_CONTRAT[typeRaw.toUpperCase()]?.[1] || `${typeRaw} (code ASTECH, à libeller)`);
        const mtact = num(l.CONTL_MTACT);
        const data = {
          numero: str(r.CONT_COD) || `ASTECH-${r.CONT_ID}`, position: 'bailleur', type_code: typeCode,
          statut_code: statut, objet: str(r.CONT_DES), gratuit: !mtact || String(r.CONT_GRATUIT || l.CONTL_GRATUIT || '').toUpperCase() === 'O',
          date_signature: fmtDate(pick(l, /^CONTL_DAT(SIGN|SIG)\w*$/)), date_debut: fmtDate(r.CONT_DATDEB), date_fin: fmtDate(r.CONT_DATFIN),
          date_entree: fmtDate(l.CONTL_DATENTREE), date_sortie: fmtDate(l.CONTL_DATSORTIE), date_debut_quittancement: fmtDate(l.CONTL_DATDEBQUIT), date_cloture: fmtDate(l.CONTL_DATCLO),
          periodicite: 'mensuelle', indice_type: refInd?.type || null, indice_reference_id: refInd?.id || null,
          date_revision_derniere: fmtDate(l.CONTL_DATREVD), date_revision_prochaine: fmtDate(l.CONTL_DATREVP), astech_id: String(r.CONT_ID),
          astech_raw: { contrat: raw(r), locatif: raw(l) },
        };
        const x = await upsert(tx, 'contrats', data, ['type_code', 'objet', 'date_signature', 'date_debut', 'date_fin', 'date_entree', 'date_sortie', 'date_debut_quittancement', 'date_cloture',
          'indice_type', 'indice_reference_id', 'date_revision_derniere', 'date_revision_prochaine']);
        contrMap.set(String(r.CONT_ID), x.id); count('contrats', x.created ? 'crees' : 'mis_a_jour');

        // contractant : ASTECH ne porte qu'une chaîne (pas d'identifiant tiers) — création par nom, rapprochement SEDIT ultérieur (MIG-012)
        const nom = str(l.CONTL_CONTRACTANT);
        if (!nom) { warn('contrat', r.CONT_COD, 'Aucun contractant renseigné (CONTL_CONTRACTANT vide)'); }
        else {
          const k = norm(nom);
          if (!contractantMap.has(k)) {
            const c = await tx.get(
              `INSERT INTO ${t('contractants')}(type, nom, astech_nom, astech_raw) VALUES ($1,$2,$3,$4)
               ON CONFLICT (astech_nom) WHERE astech_nom IS NOT NULL DO UPDATE SET astech_raw = EXCLUDED.astech_raw RETURNING id, (xmax = 0) AS created`,
              [FORMES.test(nom) ? 'morale' : 'physique', nom, nom, JSON.stringify({ source: 'CONTRAT_LOCATIF.CONTL_CONTRACTANT' })]);
            contractantMap.set(k, c.id); count('contractants', c.created ? 'crees' : 'mis_a_jour');
          }
          await tx.run(`INSERT INTO ${t('contrat_contractants')}(contrat_id, contractant_id, role_code) VALUES ($1,$2,'titulaire') ON CONFLICT DO NOTHING`, [x.id, contractantMap.get(k)]);
        }
        // dépôt de garantie
        const dep = num(l.CONTL_DEPMT);
        if (dep > 0) {
          const ex = await tx.get(`SELECT id FROM ${t('depots_garantie')} WHERE contrat_id = $1`, [x.id]);
          if (!ex) await tx.run(`INSERT INTO ${t('depots_garantie')}(contrat_id, montant) VALUES ($1,$2)`, [x.id, dep]);
        }
      }
      for (const r of aff) {
        const c = contrMap.get(String(r.CONTAF_ID)); const b = bienMap.get(String(r.CONTAF_ARBID));
        if (!c) continue;
        if (!b) { warn('contrat_bien', r.CONTAF_ID, `Bien ${r.CONTAF_ARBID} absent du périmètre locatif`); continue; }
        await tx.run(`INSERT INTO ${t('contrat_biens')}(contrat_id, bien_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c, b]);
      }

      // ---------- 3b. Tiers ASTECH (CONTRAT_AFFL → FOURNISSEUR) : code tiers, SIRET, coordonnées ----------
      const fous = new Map((await src.rows(conn, 'SELECT * FROM FOURNISSEUR WHERE SFOU_COD IN (SELECT CONTAFL_FOURN FROM CONTRAT_AFFL WHERE CONTAFL_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF))'))
        .map((f) => [`${f.SFOU_SOC}|${f.SFOU_COD}`, f]));
      let tiersLies = 0;
      for (const a of affl) {
        const f = fous.get(`${a.CONTAFL_SOCFOURN}|${a.CONTAFL_FOURN}`); const cid = contrMap.get(String(a.CONTAFL_CONTID));
        if (!f || !cid) { if (!f) warn('tiers', a.CONTAFL_CONTID, `Fournisseur ${a.CONTAFL_FOURN} introuvable`); continue; }
        const siret = str(f.SFOU_SIRET)?.replace(/\s/g, '') || null;
        const adresse = [f.SFOU_ADR1, f.SFOU_ADR2, f.SFOU_ADR3].map(str).filter(Boolean).join(' ') || null;
        // Les IBAN / RIB (CONTAFL_IBAN, SREG_*) ne sont volontairement PAS repris : données sensibles.
        const r = await tx.run(
          `UPDATE ${t('contractants')} SET astech_tiers_cod = COALESCE(astech_tiers_cod, $2), siren = COALESCE(siren, $3), siret = COALESCE(siret, $9), email = COALESCE(email, $4),
             telephone = COALESCE(telephone, $5), adresse = COALESCE(adresse, $6), code_postal = COALESCE(code_postal, $7), ville = COALESCE(ville, $8),
             type = CASE WHEN $3 IS NOT NULL THEN 'morale' ELSE type END, updated_at = now()
           WHERE id IN (SELECT contractant_id FROM ${t('contrat_contractants')} WHERE contrat_id = $1)`,
          [cid, String(f.SFOU_COD), siret && siret.length >= 9 ? siret.slice(0, 9) : null, str(f.SFOU_EMAIL1), str(f.SFOU_TEL1), adresse, str(f.SFOU_ADRFACTCP), str(f.SFOU_VILLE), siret && /^[0-9]{14}$/.test(siret) ? siret : null]);
        tiersLies += r.changes;
      }
      stats.tiers_astech = { fournisseurs: fous.size, liens: tiersLies };

      // ---------- 4. Conditions financières : rubriques du contrat (CONTRAT_RUB.CONTRU_CONTID), montant COURANT lu sur la dernière échéance ----------
      // Les lignes d'échéance (CONTRAT_ECHLIGNE) distinguent loyer et charges et portent le montant réellement appelé, révisions comprises.
      stats.mapping.conditions = { CONTRAT_RUB: rub[0] ? Object.keys(rub[0]) : '(table absente ou vide)', CONTRAT_ECHLIGNE: ligEch[0] ? Object.keys(ligEch[0]) : '(vide)' };
      const rubParId = new Map(rub.map((r) => [String(r.CONTRU_ID), r]));
      const classeTexte = (txt) => (/CHARGE|PROVISION/i.test(txt || '') ? 'provision_charges' : /TAXE/i.test(txt || '') ? 'taxe_fonciere' : 'loyer');
      const classeLigne = (l) => {
        if (['CONTEL_CHARGEAV', 'CONTEL_CHARGE', 'CONTEL_CHARGEREGUL'].some((k) => String(l[k] || '').toUpperCase() === 'O')) return 'provision_charges';
        const rb = rubParId.get(String(l.CONTEL_RUBID));
        return classeTexte(rb?.CONTRU_DES || l.CONTEL_DES);
      };
      const lignesParEch = new Map();
      for (const l of ligEch) { const k = String(l.CONTEL_ECHID); if (!lignesParEch.has(k)) lignesParEch.set(k, []); lignesParEch.get(k).push(l); }
      const derniereParContrat = new Map(); // CONT_ID -> dernière échéance (<= aujourd'hui, sinon la plus récente)
      const aujourdhui = new Date().toISOString().slice(0, 10);
      for (const r of [...echHist, ...ech]) {
        const k = String(r.CONTEC_CONTID); const d = fmtDate(r.CONTEC_DATEDEB) || fmtDate(r.CONTEC_DATE) || '';
        const cur = derniereParContrat.get(k); const ok = d <= aujourdhui;
        if (!cur || (ok && (!cur.ok || d > cur.d)) || (!ok && !cur.ok && d < cur.d)) derniereParContrat.set(k, { d, ok, id: String(r.CONTEC_ID) });
      }
      // Reprise précédente : rubriques mal rattachées (identifiant de rubrique pris pour celui du contrat) -> on repart des rubriques ASTECH.
      // 1) conditions « historiques » sans marqueur ASTECH, uniquement pour les contrats qui n'ont pas encore été repris proprement (une saisie manuelle ultérieure est préservée) ;
      // 2) conditions déjà marquées RUB: (issues d'ASTECH) : recréées à chaque reprise.
      await tx.run(`DELETE FROM ${t('conditions_financieres')} cf WHERE cf.astech_id IS NULL AND COALESCE(cf.libelle,'') <> 'Loyer révisé'
                      AND cf.contrat_id IN (SELECT id FROM ${t('contrats')} WHERE astech_id IS NOT NULL)
                      AND NOT EXISTS (SELECT 1 FROM ${t('conditions_financieres')} c2 WHERE c2.contrat_id = cf.contrat_id AND c2.astech_id LIKE 'RUB:%')`);
      await tx.run(`DELETE FROM ${t('conditions_financieres')} WHERE astech_id LIKE 'RUB:%'`);
      const rubParContrat = new Map();
      for (const r of rub) {
        const cid = contrMap.get(String(r.CONTRU_CONTID)); if (!cid) continue;
        if (String(r.CONTRU_UNEFOIS || '').toUpperCase() === 'O') continue; // rubrique ponctuelle : pas une condition récurrente
        (rubParContrat.get(cid) || rubParContrat.set(cid, []).get(cid)).push(r);
      }
      for (const r of contrat) {
        const cid = contrMap.get(String(r.CONT_ID)); const l = locByCont.get(String(r.CONT_ID)) || {};
        const de = fmtDate(l.CONTL_DATDEBQUIT) || fmtDate(l.CONTL_DATENTREE) || fmtDate(r.CONT_DATDEB);
        const der = derniereParContrat.get(String(r.CONT_ID)); const lignesDer = der ? lignesParEch.get(der.id) || [] : [];
        const lignes = [];
        for (const rb of rubParContrat.get(cid) || []) {
          const courant = lignesDer.find((x) => String(x.CONTEL_RUBID) === String(rb.CONTRU_ID));
          // montant courant : ligne de la dernière échéance (hors prorata), à défaut montant révisé de la rubrique, à défaut montant de base
          const montant = num(courant?.CONTEL_MTHT_NOPRORATA) ?? num(courant?.CONTEL_MTTC) ?? (String(rb.CONTRU_R_ACT || '').toUpperCase() === 'O' ? num(rb.CONTRU_R_MTTTC) : null) ?? num(rb.CONTRU_MTTC) ?? num(rb.CONTRU_MTHT);
          if (!montant) continue;
          lignes.push({ code: classeTexte(rb.CONTRU_DES), libelle: str(rb.CONTRU_DES), montant, de, id: `RUB:${rb.CONTRU_ID}` });
        }
        if (!lignes.length) { // contrat sans rubrique exploitable : loyer et charges d'avance portés par le bail (CONTL_MTACT / CONTL_MTADD)
          if (num(l.CONTL_MTACT)) lignes.push({ code: 'loyer', libelle: 'Loyer (ASTECH CONTL_MTACT)', montant: num(l.CONTL_MTACT), de, id: `RUB:BAIL-${r.CONT_ID}-L` });
          if (num(l.CONTL_MTADD)) lignes.push({ code: 'provision_charges', libelle: 'Charges (ASTECH CONTL_MTADD)', montant: num(l.CONTL_MTADD), de, id: `RUB:BAIL-${r.CONT_ID}-C` });
        }
        for (const x of lignes) {
          await ensureRef(tx, 'rubrique', x.code, x.code);
          await tx.run(`INSERT INTO ${t('conditions_financieres')}(contrat_id, rubrique_code, libelle, montant, date_effet, astech_id) VALUES ($1,$2,$3,$4,$5,$6)`, [cid, x.code, x.libelle, x.montant, x.de, x.id]);
          count('conditions', 'crees');
        }
      }

      // ---------- 5. Échéances (historique émis d'abord, puis prévisionnel sans doublon de période) ----------
      // Loyer et charges viennent des lignes d'échéance (somme des lignes = total ASTECH) ; les jours de prorata aussi.
      stats.mapping.echeances = { CONTRAT_ECH: ech[0] ? Object.keys(ech[0]) : [] };
      const today = new Date().toISOString().slice(0, 10);
      const vues = new Set((await tx.all(`SELECT contrat_id || '|' || periode_debut AS k FROM ${t('echeances')} WHERE source = 'app'`)).map((x) => x.k)); // échéances générées par l'application : pas de doublon
      for (const [liste, source, pref] of [[echHist, 'astech_hist', 'H'], [ech, 'astech_prev', 'P']]) {
        for (const r of liste) {
          count('echeances', 'lus');
          const cid = contrMap.get(String(r.CONTEC_CONTID)); if (!cid) { count('echeances', 'rejetes'); continue; }
          const dd = fmtDate(r.CONTEC_DATEDEB) || (fmtDate(r.CONTEC_DATE) || '').slice(0, 8) + '01';
          if (!dd || dd.length !== 10) { count('echeances', 'rejetes'); warn('echeance', r.CONTEC_CONTID, 'Échéance sans date exploitable'); continue; }
          const k = `${cid}|${dd}`; if (vues.has(k)) continue; vues.add(k);
          const total = num(r.CONTEC_MTTC) ?? num(r.CONTEC_MTHT) ?? 0;
          const statut = fmtDate(r.CONTEC_DATGF) ? 'titree' : (r.CONTEC_NUMQUIT || r.CONTEC_DATQUIT) ? 'emise' : (fmtDate(r.CONTEC_DATE) || dd) < today ? 'echue_non_emise' : 'planifiee';
          const lg = lignesParEch.get(String(r.CONTEC_ID)) || [];
          let loyer = total; let charges = 0; let prorata = false; let jEff = null; let jPer = null;
          if (lg.length) {
            charges = Math.round(lg.filter((x) => classeLigne(x) === 'provision_charges').reduce((s, x) => s + (num(x.CONTEL_MTTC) || 0), 0) * 100) / 100;
            loyer = Math.round((total - charges) * 100) / 100;
            const p = lg.find((x) => num(x.CONTEL_NBJ_EFF) !== null && num(x.CONTEL_NBJ_PER) && num(x.CONTEL_NBJ_EFF) < num(x.CONTEL_NBJ_PER));
            if (p) { prorata = true; jEff = num(p.CONTEL_NBJ_EFF); jPer = num(p.CONTEL_NBJ_PER); }
          } else warn('echeance', r.CONTEC_ID, 'Aucune ligne d\'échéance : le total est porté en loyer', 'info');
          const x = await tx.get(
            `INSERT INTO ${t('echeances')}(contrat_id, libelle, periode_debut, periode_fin, date_exigibilite, montant_loyer, montant_charges, montant_total, prorata, prorata_jours, prorata_base,
                statut, numero_quittance, date_quittance, date_titrage, source, astech_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             ON CONFLICT (astech_key) DO UPDATE SET montant_loyer = EXCLUDED.montant_loyer, montant_charges = EXCLUDED.montant_charges, prorata = EXCLUDED.prorata,
               prorata_jours = EXCLUDED.prorata_jours, prorata_base = EXCLUDED.prorata_base
               WHERE ${t('echeances')}.montant_total = EXCLUDED.montant_total  -- une échéance ajustée à la main (total modifié) n'est pas touchée
             RETURNING (xmax = 0) AS created`,
            [cid, str(r.CONTEC_DES), dd, fmtDate(r.CONTEC_DATEFIN), fmtDate(r.CONTEC_DATE) || dd, loyer, charges, total, prorata, jEff, jPer, statut, str(r.CONTEC_NUMQUIT), fmtDate(r.CONTEC_DATQUIT), fmtDate(r.CONTEC_DATGF), source,
              `${pref}:${r.CONTEC_CONTID}:${dd}`]);
          if (x) count('echeances', x.created ? 'crees' : 'mis_a_jour');
        }
      }

      // ---------- 6. Révisions ----------
      for (const r of revs) {
        count('revisions', 'lus');
        const cid = contrMap.get(String(r.CONTRV_CONTID)); if (!cid) { count('revisions', 'rejetes'); continue; }
        const x = await tx.get(
          `INSERT INTO ${t('revisions')}(contrat_id, date_revision, date_application, indice_prec_id, indice_nouv_id, pourcentage, montant_avant, montant_apres, statut, rattrapage, astech_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'appliquee',$9,$10) ON CONFLICT (astech_id) DO NOTHING RETURNING id`,
          [cid, fmtDate(r.CONTRV_DAT), fmtDate(r.CONTRV_DATAPPLI), indMap.get(String(r.CONTRV_INSEEP))?.id || null, indMap.get(String(r.CONTRV_INSEE))?.id || null,
            num(r.CONTRV_POURC), num(r.CONTRV_MTP), num(r.CONTRV_MT), String(r.CONTRV_RATTRAP || '').toUpperCase() === 'O', String(r.CONTRV_ID)]);
        count('revisions', x ? 'crees' : 'mis_a_jour');
      }

      // ---------- 7. Statut d'occupation (déduit, seulement si non renseigné) ----------
      await tx.run(`UPDATE ${t('biens')} b SET statut_occupation = CASE WHEN EXISTS (SELECT 1 FROM ${t('contrat_biens')} cb JOIN ${t('contrats')} c ON c.id = cb.contrat_id WHERE cb.bien_id = b.id AND c.statut_code = 'en_cours') THEN 'occupe' ELSE 'vacant' END
                    WHERE b.astech_id IS NOT NULL AND b.niveau = 'unite' AND b.statut_occupation IS NULL`);

      // ---------- 8. Doublons probables : signalés, JAMAIS fusionnés (MIG-005 / MIG-006) ----------
      const ct = await tx.all(`SELECT id, nom FROM ${t('contractants')}`);
      const groupes = new Map();
      for (const c of ct) { const key = norm(c.nom).split(' ').sort().join(' '); (groupes.get(key) || groupes.set(key, []).get(key)).push(c); }
      let nbDoublons = 0;
      for (const g of groupes.values()) {
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
          const [a, b] = [g[i].id, g[j].id].sort((x, y) => x - y);
          const r = await tx.run(`INSERT INTO ${t('reprise_doublons')}(entite, id_a, id_b, motif) VALUES ('contractant',$1,$2,'Même nom (casse, accents ou ordre des mots différents)') ON CONFLICT DO NOTHING`, [a, b]);
          nbDoublons += r.changes;
        }
      }
      const bi = await tx.all(`SELECT id, designation, COALESCE(adresse,'') AS adresse FROM ${t('biens')} WHERE niveau = 'unite' AND adresse IS NOT NULL`);
      const gb = new Map();
      for (const b of bi) { const key = `${norm(b.designation)}|${norm(b.adresse)}`; (gb.get(key) || gb.set(key, []).get(key)).push(b); }
      for (const g of gb.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const r = await tx.run(`INSERT INTO ${t('reprise_doublons')}(entite, id_a, id_b, motif) VALUES ('bien',$1,$2,'Même désignation et même adresse') ON CONFLICT DO NOTHING`, [g[i].id, g[j].id]);
        nbDoublons += r.changes;
      }
      stats.doublons_detectes = nbDoublons;

      if (dryRun) throw Object.assign(new Error('DRY_RUN'), { dry: true });
      return { bienMap, contrMap };
    }).catch((e) => { if (e.dry) return null; throw e; });

    // ---------- 9. Documents (hors transaction : écriture dans le stockage) ----------
    if (documents && !dryRun && result) stats.documents = await importerDocuments({ conn, user, result, warn, log });

    for (const a of anomalies.slice(0, 2000)) {
      await db.run(`INSERT INTO ${t('reprise_anomalies')}(run_id, niveau, objet, reference, message) VALUES ($1,$2,$3,$4,$5)`, [job.id, a.niveau, a.objet, a.reference, a.message]);
    }
    await db.run(`UPDATE ${t('reprise_runs')} SET statut = 'termine', fin = now(), stats = $2 WHERE id = $1`, [job.id, JSON.stringify(stats)]);
    return { run_id: job.id, dryRun, stats, anomalies: anomalies.length };
  } catch (e) {
    await db.run(`UPDATE ${t('reprise_runs')} SET statut = 'erreur', fin = now(), erreur = $2, stats = $3 WHERE id = $1`, [job.id, e.message, JSON.stringify(stats)]);
    throw e;
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}

// Documents : rattachés aux contrats (DAFF_FRM = 25) et aux biens (DAFF_FRM = 1). Contenu en base (SBCG_RES.RES_BIN) ou fichier du filer ASTECH.
async function importerDocuments({ conn, user, result, warn, log }) {
  const oracledb = src.loadOracle();
  const aff = await src.rows(conn, `SELECT * FROM DOC_AFFECT WHERE DAFF_FRM IN (25, 1)`);
  const out = { lus: 0, importes: 0, inaccessibles: 0, deja_repris: 0, erreurs: 0 };
  const byDoc = new Map();
  for (const a of aff) {
    const objet = a.DAFF_FRM === 25 ? ['contrat', result.contrMap.get(String(a.DAFF_ENTID))] : ['bien', result.bienMap.get(String(a.DAFF_ENTID))];
    if (!objet[1]) continue;
    (byDoc.get(String(a.DAFF_DOCID)) || byDoc.set(String(a.DAFF_DOCID), []).get(String(a.DAFF_DOCID))).push({ objet_type: objet[0], objet_id: objet[1] });
  }
  log(`${byDoc.size} documents rattachés au périmètre locatif`);
  for (const [docId, links] of byDoc) {
    out.lus++;
    try {
      if (await db.get(`SELECT 1 AS x FROM ${t('documents')} WHERE astech_id = $1`, [docId])) { out.deja_repris++; continue; }
      const d = (await src.rows(conn, `SELECT * FROM DOC WHERE DOC_ID = :i`, [docId]))[0]; if (!d) continue;
      if ((fmtDate(d.DOC_CDATE) || '') < config.repriseDepuis) { out.ecartes_avant_coupure = (out.ecartes_avant_coupure || 0) + 1; continue; }
      const nom = str(d.DOC_FILE) || str(d.DOC_TITRE) || `document-${docId}`;
      let buffer = null;
      if (d.DOC_RESID) {
        const r = (await src.rows(conn, `SELECT RES_BIN FROM SBCG_RES WHERE RES_ID = :i`, [d.DOC_RESID], { fetchInfo: { RES_BIN: { type: oracledb.BUFFER } } }))[0];
        buffer = r?.RES_BIN || null;
      }
      if (!buffer && d.DOC_FOLDER && d.DOC_FILE) {
        const p = path.join(String(d.DOC_FOLDER), String(d.DOC_FILE));
        try { buffer = fs.readFileSync(p); } catch { /* chemin ASTECH inaccessible (ex. \\POSTE004\C$\TEMP) */ }
      }
      if (!buffer) { out.inaccessibles++; continue; }
      const titre = `${nom} ${d.DOC_TITRE || ''}`.toUpperCase();
      const type_code = /\bRIB\b/.test(titre) ? 'rib' : /IDENTIT|\bCNI\b|PASSEPORT/.test(titre) ? 'piece_identite' : /KBIS/.test(titre) ? 'kbis' : /ASSURANCE/.test(titre) ? 'attestation_assurance' : 'autre';
      await docs.create({ username: user }, { buffer, nom, mime: null, type_code, links, astech_id: docId, commentaire: str(d.DOC_OBS) });
      out.importes++;
    } catch (e) { out.erreurs++; warn('document', docId, e.message); }
  }
  if (out.inaccessibles) warn('document', null, `${out.inaccessibles} document(s) sans contenu accessible (BLOB absent, chemin ASTECH injoignable)`, 'info');
  return out;
}

module.exports = { run };
