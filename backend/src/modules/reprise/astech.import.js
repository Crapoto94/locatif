// Reprise des données du module Gestion locative d'ASTECH (MIG-001 à MIG-013).
// - Idempotent : clé = identifiant historique ASTECH (astech_id) ; une relance complète les champs vides et ne réécrase pas les corrections saisies.
// - Aucune fusion destructive : les doublons probables sont signalés (reprise_doublons) et examinés par les utilisateurs.
// - Les noms de colonnes non documentés sont résolus par convention (pick) ; le rapport liste ce qui a été utilisé.
const fs = require('fs');
const path = require('path');
const { db, t } = require('../../db');
const src = require('./astech.source');
const docs = require('../documents/documents.service');

const { fmtDate, num, str, pick, pickKey, raw } = src;
const TYPES_INDICE = { 1: 'IRL', 2: 'ICC', 5: 'ILC', 6: 'ILAT' };
const FORMES = /\b(SARL|SAS|SASU|SCI|SCM|SA|EURL|SNC|ASSOC\w*|SOCIETE|SOCIÉTÉ|CABINET|COMITE|COMITÉ|CENTRE|UNION|FEDERATION|FÉDÉRATION|CLUB|ECOLE|ÉCOLE|MUTUELLE|FONDATION|SYNDICAT|COOPERATIVE|COOPÉRATIVE|GROUPE|ETS|ETABLISSEMENTS)\b/i;
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
    const [indRows, arbLoc, arbo, adr, contrat, contLoc, aff, rub, ech, echHist, revs] = await Promise.all([
      src.rows(conn, 'SELECT * FROM INDICEINSEE'),
      src.rows(conn, 'SELECT * FROM ARBO_LOCATIF'),
      src.rows(conn, 'SELECT * FROM ARBO WHERE ARB_ID IN (SELECT ARBLOC_ID FROM ARBO_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM ARBO_ADR WHERE ARBA_ID IN (SELECT ARBLOC_ID FROM ARBO_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT WHERE CONT_ID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_LOCATIF'),
      src.rows(conn, 'SELECT * FROM CONTRAT_AFF WHERE CONTAF_ID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      (await src.tableExists(conn, 'CONTRAT_RUB')) ? src.rows(conn, 'SELECT * FROM CONTRAT_RUB') : [],
      src.rows(conn, 'SELECT * FROM CONTRAT_ECH WHERE CONTEC_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_ECHTERMINEE WHERE CONTEC_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
      src.rows(conn, 'SELECT * FROM CONTRAT_REVISION WHERE CONTRV_CONTID IN (SELECT CONTL_ID FROM CONTRAT_LOCATIF)'),
    ]);
    const genres = await lookupMap(conn, 'PATRIGENE', ['SGEN_COD'], ['SGEN_DES']);
    const cats = await lookupMap(conn, 'CATEGORIE', ['SCAT_COD', 'SCAT_ID', 'SCAT_CODE'], ['SCAT_DES']);
    const scats = await lookupMap(conn, 'SOUSCATEGORIE', ['SSCAT_COD', 'SSCAT_ID', 'SSCAT_CODE'], ['SSCAT_DES']);

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

      // ---------- 2. Biens (+ site / bâtiment déduits du code patrimoine S###B##…) ----------
      const locByArb = new Map(arbLoc.map((r) => [String(r.ARBLOC_ID), r]));
      const adrByArb = new Map(adr.map((r) => [String(r.ARBA_ID), r]));
      const bienMap = new Map(); // ARB_ID -> id
      const parentCache = new Map(); // code -> id
      async function ensureParent(code, niveau, designation) {
        if (parentCache.has(code)) return parentCache.get(code);
        const a = await tx.get(`INSERT INTO ${t('biens')}(code, designation, niveau, astech_id) VALUES ($1,$2,$3,$4)
                                ON CONFLICT (astech_id) DO UPDATE SET code = EXCLUDED.code RETURNING id`, [code, designation || code, niveau, `CODE:${code}`]);
        parentCache.set(code, a.id); return a.id;
      }
      const sample = arbo[0]; const locSample = arbLoc[0] || {}; const adrSample = adr[0] || {};
      stats.mapping.biens = { ARBO: sample ? Object.keys(sample) : [], ARBO_LOCATIF: Object.keys(locSample), ARBO_ADR: Object.keys(adrSample) };
      for (const r of arbo) {
        count('biens', 'lus');
        const loc = locByArb.get(String(r.ARB_ID)) || {}; const a = adrByArb.get(String(r.ARB_ID)) || {};
        const genre = genres.get(String(r.ARB_GENRE)); const cat = cats.get(String(r.ARB_CAT)); const scat = scats.get(String(r.ARB_SCAT));
        const code = str(r.ARB_CODE); const m = /^(S\d+)(B\d+)?/i.exec(code || '');
        const parent = m && code.length > (m[0].length) ? await ensureParent(m[0].toUpperCase(), m[2] ? 'batiment' : 'site', null) : null;
        const adresse = [pick(a, /^ARBA_(NUM|NUMERO)$/), pick(a, /^ARBA_(ADR1?|RUE|VOIE|LIB\w*|ADRESSE)$/)].filter(Boolean).join(' ') || null;
        const data = {
          parent_id: parent, niveau: 'unite', code, designation: str(r.ARB_DES) || str(r.ARB_NOMC) || code || `Bien ${r.ARB_ID}`,
          type_code: typeBien(`${genre || ''} ${cat || ''} ${scat || ''} ${r.ARB_DES || ''}`), categorie: [genre, cat, scat].filter(Boolean).join(' / ') || null,
          adresse: str(adresse), code_postal: str(pick(a, /^ARBA_(CP|CODPOST\w*|CODE_?POSTAL)$/)), ville: str(pick(a, /^ARBA_(VILLE|COMMUNE|LOCALITE)$/)),
          surface: num(pick(loc, /SURF/) ?? pick(r, /^ARB_(SURF\w*|SUP\w*)$/)), service_code: str(r.ARB_SSERV), astech_id: String(r.ARB_ID),
          astech_raw: { arbo: raw(r), locatif: raw(loc), adresse: raw(a) },
        };
        await ensureRef(tx, 'type_bien', data.type_code, data.type_code);
        const x = await upsert(tx, 'biens', data, ['code', 'designation', 'type_code', 'categorie', 'adresse', 'code_postal', 'ville', 'surface', 'service_code', 'parent_id']);
        bienMap.set(String(r.ARB_ID), x.id); count('biens', x.created ? 'crees' : 'mis_a_jour');
      }

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
        const typeRaw = str(pick(r, /^CONT_(TYP|TYPE|NAT|CAT)\w*$/));
        if (typeRaw) await ensureRef(tx, 'type_contrat', norm(typeRaw).toLowerCase().replace(/ /g, '_').slice(0, 50), typeRaw);
        const mtact = num(l.CONTL_MTACT);
        const data = {
          numero: str(r.CONT_COD) || `ASTECH-${r.CONT_ID}`, position: 'bailleur', type_code: typeRaw ? norm(typeRaw).toLowerCase().replace(/ /g, '_').slice(0, 50) : null,
          statut_code: statut, objet: str(pick(r, /^CONT_(DES|LIB|OBJ)\w*$/)), gratuit: !mtact,
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

      // ---------- 4. Conditions financières ----------
      stats.mapping.conditions = { CONTRAT_RUB: rub[0] ? Object.keys(rub[0]) : '(table absente ou vide)' };
      const rubParContrat = new Map();
      for (const r of rub) {
        const kc = pickKey(r, /^CONTRU_(CONTID|CONT_ID|ID)$/, /^CONTRU_CONT\w*$/);
        const cid = kc ? contrMap.get(String(r[kc])) : null;
        if (!cid) continue;
        const libelle = str(pick(r, /^CONTRU_(DES|LIB)\w*$/));
        const montant = num(pick(r, /^CONTRU_(MT|MONT)\w*$/, /MT/));
        if (!montant) continue;
        const code = /PROVISION/i.test(libelle || '') ? 'provision_charges' : /CHARGE/i.test(libelle || '') ? 'charges' : /TAXE/i.test(libelle || '') ? 'taxe_fonciere' : 'loyer';
        const de = fmtDate(pick(r, /^CONTRU_(DATDEB|DATEFF\w*|DATD\w*)$/)); const df = fmtDate(pick(r, /^CONTRU_(DATFIN|DATF\w*)$/));
        (rubParContrat.get(cid) || rubParContrat.set(cid, []).get(cid)).push({ code, libelle, montant, de, df, id: pick(r, /^CONTRU_ID$/) });
      }
      for (const r of contrat) {
        const cid = contrMap.get(String(r.CONT_ID)); const l = locByCont.get(String(r.CONT_ID)) || {};
        if ((await tx.get(`SELECT 1 AS x FROM ${t('conditions_financieres')} WHERE contrat_id = $1 LIMIT 1`, [cid]))) continue; // déjà repris : on ne réécrit pas
        const lignes = rubParContrat.get(cid) || (num(l.CONTL_MTACT) ? [{ code: 'loyer', libelle: 'Loyer (ASTECH CONTL_MTACT)', montant: num(l.CONTL_MTACT), de: fmtDate(l.CONTL_DATDEBQUIT) || fmtDate(l.CONTL_DATENTREE) || fmtDate(r.CONT_DATDEB), df: null }] : []);
        for (const x of lignes) {
          await ensureRef(tx, 'rubrique', x.code, x.code);
          await tx.run(`INSERT INTO ${t('conditions_financieres')}(contrat_id, rubrique_code, libelle, montant, date_effet, date_fin) VALUES ($1,$2,$3,$4,$5,$6)`, [cid, x.code, x.libelle, x.montant, x.de, x.df]);
          count('conditions', 'crees');
        }
      }

      // ---------- 5. Échéances (historique émis d'abord, puis prévisionnel sans doublon de période) ----------
      stats.mapping.echeances = { CONTRAT_ECH: ech[0] ? Object.keys(ech[0]) : [] };
      const today = new Date().toISOString().slice(0, 10);
      const vues = new Set((await tx.all(`SELECT contrat_id || '|' || periode_debut AS k FROM ${t('echeances')}`)).map((x) => x.k));
      for (const [liste, source, pref] of [[echHist, 'astech_hist', 'H'], [ech, 'astech_prev', 'P']]) {
        for (const r of liste) {
          count('echeances', 'lus');
          const cid = contrMap.get(String(r.CONTEC_CONTID)); if (!cid) { count('echeances', 'rejetes'); continue; }
          const dd = fmtDate(r.CONTEC_DATEDEB) || (fmtDate(r.CONTEC_DATE) || '').slice(0, 8) + '01';
          if (!dd || dd.length !== 10) { count('echeances', 'rejetes'); warn('echeance', r.CONTEC_CONTID, 'Échéance sans date exploitable'); continue; }
          const k = `${cid}|${dd}`; if (vues.has(k)) continue; vues.add(k);
          const total = num(r.CONTEC_MTTC) ?? num(r.CONTEC_MTHT) ?? 0;
          const statut = fmtDate(r.CONTEC_DATGF) ? 'mandatee' : (r.CONTEC_NUMQUIT || r.CONTEC_DATQUIT) ? 'emise' : (fmtDate(r.CONTEC_DATE) || dd) < today ? 'echue_non_emise' : 'planifiee';
          // Le détail loyer / charges n'est pas reconstructible depuis CONTRAT_ECH : le total est porté en loyer (voir rapport).
          await tx.run(
            `INSERT INTO ${t('echeances')}(contrat_id, libelle, periode_debut, periode_fin, date_exigibilite, montant_loyer, montant_charges, montant_total, statut, numero_quittance, date_quittance, date_mandatement, source, astech_key)
             VALUES ($1,$2,$3,$4,$5,$6,0,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (astech_key) DO NOTHING`,
            [cid, str(r.CONTEC_DES), dd, fmtDate(r.CONTEC_DATEFIN), fmtDate(r.CONTEC_DATE) || dd, total, statut, str(r.CONTEC_NUMQUIT), fmtDate(r.CONTEC_DATQUIT), fmtDate(r.CONTEC_DATGF), source,
              `${pref}:${r.CONTEC_CONTID}:${dd}`]);
          count('echeances', 'crees');
        }
      }
      if (stats.objets.echeances?.crees) warn('echeance', null, 'Montants d\'échéances repris en total (MTTC) : la ventilation loyer / charges n\'existe pas dans CONTRAT_ECH ; à recomposer via les conditions financières.', 'info');

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
