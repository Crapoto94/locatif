// FILIEN — facturation de fin de campagne mensuelle : une recette (titre) par échéance, un fichier .filien.txt
// et ses pièces jointes déposés dans un dossier. « Déposé » = facturation considérée comme réalisée (échéances « émises »).
// Le format du fichier est dans filien.format.js ; les règles (et l'écart avec la spec) dans la skill « filien ».
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, t } = require('../../db');
const { config } = require('../../config');
const store = require('../documents/store/store');
const audit = require('../../services/audit');
const { httpError } = require('../../shared/http');
const F = require('./filien.format');
const depotMod = require('./filien.depot');

const CLE = 'filien';
const MAX_PJ = 5;

const DEFAUTS = {
  // En-tête /##/PARAM/ (§2.1)
  organisme: '01', budget: '', exercice: null, avancement: '5', rejet_dispo: true, rejet_ca: false, rejet_marche: false,
  // Valeurs par défaut des mouvements
  type: 'R', monnaie: 'E', calendrier: '01', existant: 'N', pre_bordereau: '800',
  mouvement_prochain: 'LOC00001', titre_interne_prochain: '00001',
  libelle_mouvement: 'Loyer {mois} {annee}', objet: 'Loyer {mois} {annee} - {contrat}', complement: '{bien}',
  detail_prestations: true, tiers_solidaires: false,
  // Pièces jointes
  dossier_depot: '', chemin_sedit: '', smb_utilisateur: '', smb_domaine: 'WORKGROUP', smb_mot_de_passe_enc: '', joindre_detail: true, type_piece_detail: '011', joindre_types: ['contrat', 'convention_occupation'], type_piece_autres: '', type_document: '',
};
const RUBRIQUES = [['loyer', 'Loyer / redevance'], ['charges', 'Charges et provisions']];
const LIBELLE_DEFAUT = { loyer: 'Loyer', charges: 'Charges' };

const PARAM_AVANCEMENT = ['1', '2', '3', '4', '5'];

// Ce que l'API renvoie : jamais le mot de passe, seulement « défini ».
const publique = (c) => { const { smb_mot_de_passe_enc: enc, ...r } = c; return { ...r, smb_mot_de_passe_defini: Boolean(enc) }; };

async function lireConfig() {
  const row = await db.get(`SELECT valeur FROM ${t('settings')} WHERE cle = $1`, [CLE]);
  return { ...DEFAUTS, ...(row?.valeur || {}) };
}

// Problèmes de paramétrage qui empêchent de produire un fichier valide (bloquants pour la génération).
function verifierConfig(c) {
  const e = [];
  if (!/^\d{2}$/.test(c.organisme || '')) e.push('Code organisme : 2 chiffres (01 à 99)');
  if (!/^[A-Za-z0-9]{1,2}$/.test(c.budget || '')) e.push('Code budget : 1 ou 2 caractères, doit exister dans SEDIT');
  if (c.exercice != null && !/^\d{4}$/.test(String(c.exercice))) e.push('Exercice : 4 chiffres (ou vide = année de la campagne)');
  if (!PARAM_AVANCEMENT.includes(String(c.avancement))) e.push('Code avancement : 1 à 5');
  if (!/^\d{1,4}$/.test(String(c.pre_bordereau || ''))) e.push('N° de pré-bordereau : 4 chiffres maximum');
  if (!/^[A-Za-z0-9_-]*\d+$/.test(c.mouvement_prochain || '') || String(c.mouvement_prochain).length > F.MAX.id) e.push('N° du prochain mouvement : préfixe + chiffres, 10 caractères maximum (ex. LOC00001)');
  if (!/^\d{1,6}$/.test(String(c.titre_interne_prochain || ''))) e.push('N° du prochain titre interne : 6 chiffres maximum');
  if (!/^\d{2}$/.test(c.calendrier || '')) e.push('Code calendrier : 2 chiffres');
  if (!['R', 'D'].includes(c.type)) e.push('Type de mouvement : R (recette) ou D (dépense)');
  if (!['E', 'F'].includes(c.monnaie)) e.push('Monnaie : E (euros) ou F (francs)');
  return e;
}

const BOOLS = ['rejet_dispo', 'rejet_ca', 'rejet_marche', 'detail_prestations', 'tiers_solidaires', 'joindre_detail'];
const TEXTES = ['organisme', 'budget', 'avancement', 'type', 'monnaie', 'calendrier', 'existant', 'pre_bordereau', 'mouvement_prochain', 'titre_interne_prochain',
  'libelle_mouvement', 'objet', 'complement', 'dossier_depot', 'chemin_sedit', 'smb_utilisateur', 'smb_domaine', 'type_piece_detail', 'type_piece_autres', 'type_document'];

async function ecrireConfig(user, body) {
  const cur = await lireConfig();
  const next = { ...cur };
  for (const k of TEXTES) if (body[k] !== undefined) next[k] = String(body[k] ?? '').trim();
  for (const k of BOOLS) if (body[k] !== undefined) next[k] = Boolean(body[k]);
  if (body.exercice !== undefined) next.exercice = body.exercice === '' || body.exercice === null ? null : parseInt(body.exercice, 10);
  // Mot de passe SAMBA : chiffré (même clé que la GED), jamais renvoyé ; vide = conservé, « effacer » via smb_effacer.
  if (body.smb_mot_de_passe) next.smb_mot_de_passe_enc = store.encrypt(body.smb_mot_de_passe);
  if (body.smb_effacer) next.smb_mot_de_passe_enc = '';
  if (body.joindre_types !== undefined) next.joindre_types = [...new Set((Array.isArray(body.joindre_types) ? body.joindre_types : []).map(String).filter(Boolean))];
  next.budget = String(next.budget).toUpperCase();
  const problemes = verifierConfig(next).filter((p) => !(p.startsWith('Code budget') && !next.budget));
  if (problemes.length) throw httpError(400, problemes.join(' ; '));
  await db.run(`INSERT INTO ${t('settings')}(cle, valeur) VALUES ($1,$2) ON CONFLICT (cle) DO UPDATE SET valeur = $2, updated_at = now()`, [CLE, JSON.stringify(next)]);
  const champs = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
  await audit.log(user, 'filien.config', 'filien', 1, { details: { champs } });
  return next;
}

// ---------- Imputations ----------
const IMP_CHAMPS = ['chapitre', 'nature', 'fonction', 'code_interne', 'structure', 'gestionnaire', 'destinataire'];
const listerImputations = () => db.all(`SELECT * FROM ${t('filien_imputations')} ORDER BY rubrique, type_contrat NULLS FIRST`);

async function remplacerImputations(user, lignes) {
  if (!Array.isArray(lignes)) throw httpError(400, 'Liste d\'imputations attendue');
  const vus = new Set();
  const propres = lignes.map((l, i) => {
    if (!RUBRIQUES.some(([c]) => c === l.rubrique)) throw httpError(400, `Ligne ${i + 1} : rubrique inconnue`);
    const typeContrat = l.type_contrat ? String(l.type_contrat) : null;
    const cle = `${l.rubrique}|${typeContrat || ''}`;
    if (vus.has(cle)) throw httpError(400, `Ligne ${i + 1} : imputation en double pour ${l.rubrique}${typeContrat ? ` / ${typeContrat}` : ''}`);
    vus.add(cle);
    const o = { rubrique: l.rubrique, type_contrat: typeContrat, libelle: String(l.libelle || '').trim().slice(0, 80) || null,
      type_mouvement: String(l.type_mouvement || 'R').toUpperCase(), sens: String(l.sens || 'R').toUpperCase(), actif: l.actif !== false };
    if (!['R', 'E', 'I'].includes(o.type_mouvement)) throw httpError(400, `Ligne ${i + 1} : type de mouvement R, E ou I`);
    if (!['R', 'D'].includes(o.sens)) throw httpError(400, `Ligne ${i + 1} : sens R ou D`);
    for (const c of IMP_CHAMPS) {
      o[c] = String(l[c] ?? '').trim();
      if (o[c].length > 10) throw httpError(400, `Ligne ${i + 1} : ${c} dépasse 10 caractères`);
    }
    if (o.actif && (!o.chapitre || !o.nature)) throw httpError(400, `Ligne ${i + 1} : chapitre et nature sont obligatoires (balise /541/)`);
    return o;
  });
  await db.tx(async (tx) => {
    await tx.run(`DELETE FROM ${t('filien_imputations')}`);
    for (const o of propres) {
      await tx.run(
        `INSERT INTO ${t('filien_imputations')}(rubrique, type_contrat, libelle, chapitre, nature, fonction, code_interne, type_mouvement, sens, structure, gestionnaire, destinataire, actif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [o.rubrique, o.type_contrat, o.libelle, o.chapitre, o.nature, o.fonction, o.code_interne, o.type_mouvement, o.sens, o.structure, o.gestionnaire, o.destinataire, o.actif]);
    }
    await audit.log(user, 'filien.imputations', 'filien', 1, { details: { nb: propres.length } }, tx);
  });
  return listerImputations();
}

// Imputation la plus précise : (rubrique + type de contrat) puis (rubrique seule).
function imputationPour(imps, rubrique, typeContrat) {
  const actives = imps.filter((i) => i.actif && i.rubrique === rubrique);
  return actives.find((i) => i.type_contrat && i.type_contrat === typeContrat) || actives.find((i) => !i.type_contrat) || null;
}

// ---------- Dossier de dépôt ----------
const ouvrirDepot = (c) => depotMod.ouvrir(c, racineDepot(c), c.smb_mot_de_passe_enc ? store.decrypt(c.smb_mot_de_passe_enc) : '');
const racineDepot = (c) => c.dossier_depot || path.join(config.storage.filerRoot, 'filien');
// Chemin tel que SEDIT le lira (/263/) : séparateur de la base indiquée (UNC / lecteur Windows ou POSIX).
function cheminSedit(c, ...segments) {
  const base = c.chemin_sedit || racineDepot(c);
  const win = /^\\\\|^[A-Za-z]:|\\/.test(base);
  return (win ? path.win32 : path.posix).join(base, ...segments);
}

async function testerDepot(c) {
  const dir = racineDepot(c); let d;
  try {
    d = ouvrirDepot(c);
    const sonde = `_test/${Date.now()}.txt`;
    await d.mkdirp('_test'); await d.ecrire(sonde, Buffer.from('test'));
    const back = String(await d.lire(sonde));
    await d.supprimerDossier('_test').catch(() => {});
    if (back !== 'test') return { ok: false, message: 'Relecture du fichier témoin incorrecte' };
    return { ok: true, message: `Écriture et relecture réussies dans ${dir}${d.mode === 'smb' ? ' (partage SAMBA)' : ''}`, dossier: dir, vu_par_sedit: cheminSedit(c, 'EXEMPLE.pdf') };
  } catch (e) {
    return { ok: false, message: `Dépôt inaccessible ou non inscriptible (${e.code || e.message}) : ${dir}` };
  } finally { d?.fermer(); }
}

// ---------- Pièce « Détail de facture » (PDF) ----------
const eur = (c) => `${F.montant(c).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
const dateFr = (iso) => (iso ? F.dateJJMMAAAA(iso).replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3') : '');

function pdfDetail(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555').text(d.ville);
    doc.moveDown(0.5).fontSize(18).fillColor('#000').text('Détail de facture');
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`${d.objet}`).moveDown(1);
    const ligne = (k, v) => { doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(`${k} `, { continued: true }).font('Helvetica').text(String(v)); };
    ligne('Débiteur :', d.contractant); ligne('Contrat :', d.contrat); ligne('Bien loué :', d.bien || '—'); ligne('Période :', `du ${dateFr(d.debut)} au ${dateFr(d.fin)}`);
    ligne('Mouvement :', `${d.mouvement} (titre interne ${d.titreInterne})`);
    if (d.prorata) ligne('Prorata :', d.prorata);
    doc.moveDown(1);
    const y0 = doc.y; doc.font('Helvetica-Bold').text('Désignation', 56, y0).text('Montant', 400, y0, { width: 139, align: 'right' });
    doc.moveTo(56, doc.y + 2).lineTo(539, doc.y + 2).strokeColor('#999').stroke(); doc.moveDown(0.6);
    doc.font('Helvetica');
    for (const l of d.lignes) { const y = doc.y; doc.text(l.libelle, 56, y, { width: 330 }).text(eur(l.cents), 400, y, { width: 139, align: 'right' }); doc.moveDown(0.3); }
    doc.moveTo(56, doc.y + 2).lineTo(539, doc.y + 2).strokeColor('#999').stroke(); doc.moveDown(0.6);
    const y1 = doc.y; doc.font('Helvetica-Bold').text('Total à payer', 56, y1).text(eur(d.total), 400, y1, { width: 139, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#666').text(`Document établi le ${dateFr(new Date().toISOString())} — ${d.ville}`, 56, doc.y + 28);
    doc.end();
  });
}

// Dernier jour du mois d'une période AAAA-MM (repli quand l'échéance n'a pas de fin).
const finMois = (periode) => { const [y, m] = periode.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
// Désignation courte d'une pièce (balise /26/, 40 caractères) : « Contrat », « Convention d'occupation »… sans parenthèse ni barre oblique.
const DESIGNATION_PJ = { contrat: 'Contrat', convention_occupation: "Convention d'occupation", deliberation: 'Délibération', decision_municipale: 'Décision municipale', avenant: 'Avenant' };
const designationPj = (dc) => DESIGNATION_PJ[dc.type_code] || (dc.type_libelle || dc.type_code || 'Pièce').split(/\s*[(/]/)[0].trim() || dc.type_code;
const nettoyerNom = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'fichier';

// Une pièce du contrat absente ou illisible dans le stockage est une anomalie bloquante (aucun fichier incomplet n'est déposé).
// Lecture par lots ; le contenu n'est conservé (garder) que pour la génération, qui le recopie dans le dossier.
async function verifierSources(mouvements, pieces, probleme, garder) {
  const aLire = pieces.filter((p) => p.source.storage_key);
  const parMouvement = new Map(mouvements.map((m) => [m.id, m]));
  for (let i = 0; i < aLire.length; i += 6) {
    await Promise.all(aLire.slice(i, i + 6).map(async (p) => {
      try { const { buffer } = await store.get(p.source.storage_key); if (garder) p.source.buffer = buffer; }
      catch (e) { const m = parMouvement.get(p.mouvement); probleme(m._echeance, `pièce « ${p.nom} » illisible dans le stockage (${e.message})`); }
    }));
  }
}

// ---------- Construction (sans effet de bord) ----------
async function lireCampagne(periode) {
  if (!/^\d{4}-\d{2}$/.test(periode)) throw httpError(400, 'Période attendue : AAAA-MM');
  const c = await db.get(`SELECT * FROM ${t('campagnes')} WHERE periode = $1`, [periode]);
  if (!c) throw httpError(404, 'Campagne non préparée');
  return c;
}

async function construire(campagne, cfg, { runName = 'APERCU', garder = false } = {}) {
  const imps = await listerImputations();
  const erreurs = []; const infos = [];
  const probleme = (e, message, bloquant = true, extra = {}) => (bloquant ? erreurs : infos).push({ echeance_id: e.id, contrat: e.contrat_numero, message, ...extra });

  const echs = await db.all(
    `SELECT e.id, e.contrat_id, e.libelle, e.periode_debut, e.periode_fin, e.montant_loyer, e.montant_charges, e.montant_total, e.prorata, e.prorata_jours, e.prorata_base, e.statut,
            k.numero AS contrat_numero, k.type_code, k.position, k.objet AS contrat_objet
     FROM ${t('echeances')} e JOIN ${t('contrats')} k ON k.id = e.contrat_id
     WHERE e.campagne_id = $1 AND NOT e.campagne_retiree AND e.statut <> 'annulee' ORDER BY k.numero, e.periode_debut, e.id`, [campagne.id]);
  const ids = [...new Set(echs.map((e) => e.contrat_id))];
  const [cts, biens, docs, ville] = await Promise.all([
    ids.length ? db.all(
      `SELECT cc.contrat_id, cc.role_code, ct.nom, ct.prenom, ct.tiers_sedit_id FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id
       WHERE cc.contrat_id = ANY($1) ORDER BY (cc.role_code = 'titulaire') DESC, ct.nom`, [ids]) : [],
    ids.length ? db.all(`SELECT cb.contrat_id, b.designation FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = ANY($1) ORDER BY b.designation`, [ids]) : [],
    ids.length && cfg.joindre_types.length ? db.all(
      `SELECT DISTINCT ON (l.objet_id, d.type_code) l.objet_id AS contrat_id, d.id, d.nom, d.type_code, d.storage_key, rv.libelle AS type_libelle
       FROM ${t('document_liens')} l JOIN ${t('documents')} d ON d.id = l.document_id AND d.actif AND NOT d.sensible
       LEFT JOIN ${t('ref_valeurs')} rv ON rv.domaine = 'type_document' AND rv.code = d.type_code
       WHERE l.objet_type = 'contrat' AND l.objet_id = ANY($1) AND d.type_code = ANY($2) ORDER BY l.objet_id, d.type_code, d.updated_at DESC`, [ids, cfg.joindre_types]) : [],
    db.get(`SELECT valeur FROM ${t('settings')} WHERE cle = 'general'`).then((r) => r?.valeur?.ville_nom || "Ville d'Ivry-sur-Seine"),
  ]);
  const par = (rows) => rows.reduce((m, r) => { (m[r.contrat_id] ||= []).push(r); return m; }, {});
  const ctsPar = par(cts); const biensPar = par(biens); const docsPar = par(docs);

  const exercice = cfg.exercice || parseInt(campagne.periode.slice(0, 4), 10);
  const params = { organisme: cfg.organisme, budget: cfg.budget, exercice, avancement: cfg.avancement, rejetDispo: cfg.rejet_dispo, rejetCA: cfg.rejet_ca, rejetMarche: cfg.rejet_marche };
  const { mois, annee } = F.moisAnnee(campagne.periode);

  let n = 0; const mouvements = []; const pieces = [];
  for (const e of echs) {
    if (['emise', 'titree'].includes(e.statut)) { probleme(e, `déjà ${e.statut === 'titree' ? 'titrée' : 'émise'} : non reprise dans le fichier`, false); continue; }
    if (e.position !== 'bailleur') { probleme(e, 'contrat en position « preneur » : c\'est une dépense (mandat), hors titre de recette', false); continue; }
    const contractants = ctsPar[e.contrat_id] || [];
    const principal = contractants.find((c) => c.tiers_sedit_id) || contractants[0];
    const tiers = principal?.tiers_sedit_id || '';
    const cLoyer = F.cents(e.montant_loyer); const cCharges = F.cents(e.montant_charges);
    const lignes = [];
    for (const [rubrique, c] of [['loyer', cLoyer], ['charges', cCharges]]) {
      if (c <= 0) continue;
      const imp = imputationPour(imps, rubrique, e.type_code);
      if (!imp) { probleme(e, `aucune imputation FILIEN pour « ${rubrique} »${e.type_code ? ` (type ${e.type_code})` : ''}`, true, { sans_imputation: `${rubrique}${e.type_code ? ` / ${e.type_code}` : ''}` }); continue; }
      lignes.push({ rubrique, cents: c, libelle: `${imp.libelle || LIBELLE_DEFAUT[rubrique]} ${mois} ${annee}`,
        imputation: { chapitre: imp.chapitre, nature: imp.nature, fonction: imp.fonction, codeInterne: imp.code_interne, typeMouvement: imp.type_mouvement, sens: imp.sens, structure: imp.structure, gestionnaire: imp.gestionnaire, destinataire: imp.destinataire } });
    }
    if (F.cents(e.montant_total) !== cLoyer + cCharges) probleme(e, `total (${e.montant_total}) ≠ loyer + charges (${(cLoyer + cCharges) / 100})`);
    if (!lignes.length && !erreurs.some((x) => x.echeance_id === e.id)) probleme(e, 'montant nul : rien à facturer');
    if (!tiers) probleme(e, `aucun code tiers SEDIT pour ${principal ? `« ${principal.nom} »` : 'ce contrat (pas de contractant)'}`);
    if (erreurs.some((x) => x.echeance_id === e.id)) continue;

    const nomContractant = [principal.prenom, principal.nom].filter(Boolean).join(' ');
    const bien = (biensPar[e.contrat_id] || []).map((b) => b.designation).join(' ; ');
    const v = { mois, annee, contrat: e.contrat_numero, contractant: nomContractant, bien };
    const id = F.numeroApres(cfg.mouvement_prochain, n); const titreInterne = F.numeroApres(cfg.titre_interne_prochain, n);
    const fin = e.periode_fin || finMois(campagne.periode);
    const prorata = e.prorata ? `${e.prorata_jours}/${e.prorata_base} jours` : '';
    const mv = {
      id, type: cfg.type, tiers, libelle: F.modele(cfg.libelle_mouvement, v), calendrier: cfg.calendrier, monnaie: cfg.monnaie, existant: cfg.existant,
      preBordereau: cfg.pre_bordereau, titreInterne, objet: F.modele(cfg.objet, v), complement: F.modele(cfg.complement, v),
      solidaires: cfg.tiers_solidaires ? contractants.filter((c) => c !== principal && c.tiers_sedit_id && c.tiers_sedit_id !== tiers).map((c) => c.tiers_sedit_id) : [],
      pjs: [], lignes,
      details: cfg.detail_prestations ? lignes.map((l, i) => ({ ordre: i + 1, libelle: `${l.libelle}${prorata ? ` (prorata ${prorata})` : ''}`, debut: e.periode_debut, fin, cents: l.cents })) : [],
      _echeance: e, _contractant: nomContractant, _bien: bien, _prorata: prorata,
    };
    // Pièces : documents du contrat (types paramétrés) puis le détail de facture en dernier (type de pièce 011 par défaut).
    const aJoindre = [];
    for (const dc of (docsPar[e.contrat_id] || []).slice(0, MAX_PJ - (cfg.joindre_detail ? 1 : 0))) {
      const ext = path.extname(dc.nom || '') || '.pdf';
      const nom = designationPj(dc);
      aJoindre.push({ source: { storage_key: dc.storage_key }, nom, fichier: nettoyerNom(`${nom}_${e.contrat_numero}`) + ext.toLowerCase(), typePiece: cfg.type_piece_autres });
    }
    if (cfg.joindre_detail) aJoindre.push({ source: { detail: true }, nom: 'Détail de facture', fichier: nettoyerNom(`Detail_${e.contrat_numero}_${campagne.periode}`) + '.pdf', typePiece: cfg.type_piece_detail });
    for (const pj of aJoindre) {
      mv.pjs.push({ nom: pj.nom, fichier: pj.fichier, support: '01', chemin: cheminSedit(cfg, runName, pj.fichier), typePiece: pj.typePiece, typeDocument: cfg.type_document });
      pieces.push({ mouvement: id, ...pj });
    }
    for (const msg of F.controler(mv)) probleme(e, msg);
    mouvements.push(mv); n++;
  }
  await verifierSources(mouvements, pieces, probleme, garder);
  const ok = mouvements.filter((m) => !erreurs.some((x) => x.echeance_id === m._echeance.id));
  const total = ok.reduce((s, m) => s + m.lignes.reduce((a, l) => a + l.cents, 0), 0);
  return { params, mouvements: ok, pieces: pieces.filter((p) => ok.some((m) => m.id === p.mouvement)), erreurs, infos, total, ville, exercice,
    contenu: F.generer(params, ok), ligneEcheances: echs.length };
}

// Les « imputation manquante » se répètent pour chaque échéance : une seule ligne par rubrique / type de contrat.
function regrouper(erreurs) {
  const groupes = new Map(); const autres = [];
  for (const e of erreurs) {
    if (!e.sans_imputation) { autres.push(e); continue; }
    (groupes.get(e.sans_imputation) || groupes.set(e.sans_imputation, []).get(e.sans_imputation)).push(e);
  }
  return [...[...groupes].map(([cle, l]) => ({ echeance_id: null, contrat: `${l.length} échéance(s)`, message: `aucune imputation FILIEN paramétrée pour ${cle} (menu Paramétrage FILIEN › Imputations budgétaires)` })), ...autres];
}

function resumeApercu(campagne, cfg, b) {
  return {
    periode: campagne.periode, statut_campagne: campagne.statut, facturee: Boolean(campagne.facturee_le),
    parametrage: verifierConfig(cfg), exercice: b.exercice,
    nb_mouvements: b.mouvements.length, nb_pj: b.pieces.length, total: b.total / 100,
    premier_mouvement: b.mouvements[0]?.id || null, dernier_mouvement: b.mouvements.at(-1)?.id || null,
    dossier: racineDepot(cfg), erreurs: regrouper(b.erreurs), infos: b.infos,
    mouvements: b.mouvements.map((m) => ({ id: m.id, titre_interne: m.titreInterne, echeance_id: m._echeance.id, contrat: m._echeance.contrat_numero, tiers: m.tiers, contractant: m._contractant,
      total: m.lignes.reduce((s, l) => s + l.cents, 0) / 100, lignes: m.lignes.map((l) => ({ libelle: l.libelle, montant: l.cents / 100, imputation: `${l.imputation.chapitre} ${l.imputation.nature} ${l.imputation.fonction}`.trim() })), nb_pj: m.pjs.length })),
    contenu: b.contenu,
  };
}

async function apercu(periode) {
  const c = await lireCampagne(periode); const cfg = await lireConfig();
  return resumeApercu(c, cfg, await construire(c, cfg));
}

// ---------- Génération (écrit le dossier, puis marque la facturation réalisée) ----------
const enCours = new Set();
const horodatage = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function generer(user, periode) {
  if (enCours.has(periode)) throw httpError(409, 'Une génération est déjà en cours pour cette campagne');
  enCours.add(periode);
  let runDir = null;
  try {
    const camp = await lireCampagne(periode); const cfg = await lireConfig();
    if (camp.statut !== 'validee') throw httpError(409, 'La campagne doit être validée (validation locative) avant la facturation');
    if (camp.facturee_le) throw httpError(409, `Campagne déjà facturée le ${new Date(camp.facturee_le).toLocaleDateString('fr-FR')} : annulez l'export existant pour recommencer`);
    const pb = verifierConfig(cfg); if (pb.length) throw httpError(409, `Paramétrage FILIEN incomplet : ${pb.join(' ; ')}`);

    const runName = `FILIEN-${periode}-${horodatage()}`;
    const b = await construire(camp, cfg, { runName, garder: true });
    if (b.erreurs.length) throw httpError(409, `${b.erreurs.length} anomalie(s) à corriger avant génération (voir l'aperçu)`);
    if (!b.mouvements.length) throw httpError(409, 'Aucune échéance à facturer dans cette campagne');

    // 1. Fichiers (échec ici = rien en base)
    runDir = (depotMod.estUnc(racineDepot(cfg)) ? path.win32 : path).join(racineDepot(cfg), runName);
    let depot;
    try {
      depot = ouvrirDepot(cfg);
      await depot.mkdirp(runName);
      const nomFichier = `${runName}.filien.txt`;
      const vus = new Set();
      for (const p of b.pieces) {
        if (vus.has(p.fichier)) continue; vus.add(p.fichier);
        let buf;
        if (p.source.detail) {
          const m = b.mouvements.find((x) => x.id === p.mouvement);
          buf = await pdfDetail({ ville: b.ville, objet: m.objet, contractant: m._contractant, contrat: m._echeance.contrat_numero, bien: m._bien, debut: m._echeance.periode_debut,
            fin: m._echeance.periode_fin || finMois(periode), mouvement: m.id, titreInterne: m.titreInterne, prorata: m._prorata, lignes: m.lignes, total: m.lignes.reduce((s, l) => s + l.cents, 0) });
        } else buf = p.source.buffer;
        await depot.ecrire(`${runName}/${p.fichier}`, buf);
      }
      await depot.ecrire(`${runName}/${nomFichier}`, Buffer.from(b.contenu, 'latin1'));
    } catch (e) {
      await depot?.supprimerDossier(runName).catch(() => {}); depot?.fermer();
      throw httpError(502, `Dépôt impossible dans ${racineDepot(cfg)} : ${e.code || e.message}`);
    }

    // 2. Base : export + échéances émises + compteurs + campagne facturée, en une transaction
    try {
      const exp = await db.tx(async (tx) => {
        const cur = await tx.get(`SELECT valeur FROM ${t('settings')} WHERE cle = $1 FOR UPDATE`, [CLE]);
        const v = { ...DEFAUTS, ...(cur?.valeur || {}) };
        if (v.mouvement_prochain !== cfg.mouvement_prochain || v.titre_interne_prochain !== cfg.titre_interne_prochain) throw httpError(409, 'Le paramétrage FILIEN (compteurs) a changé pendant la génération : relancez');
        const lock = await tx.get(`UPDATE ${t('campagnes')} SET facturee_le = now(), facturee_par = $2 WHERE id = $1 AND facturee_le IS NULL AND statut = 'validee' RETURNING id`, [camp.id, user.username]);
        if (!lock) throw httpError(409, 'Campagne déjà facturée ou non validée');
        const total = b.total / 100;
        const exp = await tx.get(
          `INSERT INTO ${t('filien_exports')}(campagne_id, periode, nom, dossier, fichier, nb_mouvements, nb_pj, total, premier_mouvement, dernier_mouvement, exercice, contenu, genere_par)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, nom, dossier, fichier, nb_mouvements, nb_pj, total, premier_mouvement, dernier_mouvement, genere_le`,
          [camp.id, periode, runName, runDir, `${runName}.filien.txt`, b.mouvements.length, b.pieces.length, total, b.mouvements[0].id, b.mouvements.at(-1).id, b.exercice, b.contenu, user.username]);
        for (const m of b.mouvements) {
          await tx.run(`UPDATE ${t('echeances')} SET filien_export_id = $2, filien_mouvement = $3, filien_titre_interne = $4, filien_statut_avant = statut, statut = 'emise', updated_at = now() WHERE id = $1`,
            [m._echeance.id, exp.id, m.id, m.titreInterne]);
        }
        const apres = { ...v, mouvement_prochain: F.suivant(cfg.mouvement_prochain, b.mouvements.length), titre_interne_prochain: F.suivant(cfg.titre_interne_prochain, b.mouvements.length) };
        await tx.run(`UPDATE ${t('settings')} SET valeur = $2, updated_at = now() WHERE cle = $1`, [CLE, JSON.stringify(apres)]).then(async (r) => {
          if (!r.changes) await tx.run(`INSERT INTO ${t('settings')}(cle, valeur) VALUES ($1,$2)`, [CLE, JSON.stringify(apres)]);
        });
        await tx.run(`UPDATE ${t('campagnes')} SET filien_export_id = $2 WHERE id = $1`, [camp.id, exp.id]);
        await tx.run(`INSERT INTO ${t('campagne_journal')}(campagne_id, action, motif, utilisateur) VALUES ($1,'facturation',$2,$3)`,
          [camp.id, `FILIEN généré : ${b.mouvements.length} titre(s), ${total} €, ${b.pieces.length} pièce(s) — ${runName}`, user.username]);
        await audit.log(user, 'filien.generated', 'campagne', camp.id, { details: { periode, export: exp.id, mouvements: b.mouvements.length, total, dossier: runDir } }, tx);
        return exp;
      });
      depot.fermer();
      return { ...exp, chemin_fichier: path.join(runDir, exp.fichier) };
    } catch (e) {
      await depot.supprimerDossier(runName).catch(() => {}); depot.fermer();
      throw e;
    }
  } finally { enCours.delete(periode); }
}

// ---------- Historique, téléchargement, annulation ----------
const listerExports = (periode) => db.all(
  `SELECT id, campagne_id, periode, nom, dossier, fichier, nb_mouvements, nb_pj, total, premier_mouvement, dernier_mouvement, exercice, statut, genere_par, genere_le, annule_par, annule_le, annule_motif
   FROM ${t('filien_exports')} ${periode ? 'WHERE periode = $1' : ''} ORDER BY id DESC LIMIT 100`, periode ? [periode] : []);

const lireExport = (id) => db.get(`SELECT * FROM ${t('filien_exports')} WHERE id = $1`, [id]);

async function annuler(user, id, motif) {
  const exp = await lireExport(id);
  if (!exp) throw httpError(404, 'Export introuvable');
  if (exp.statut === 'annule') throw httpError(409, 'Export déjà annulé');
  const dejaTitrees = await db.get(`SELECT count(*)::int AS n FROM ${t('echeances')} WHERE filien_export_id = $1 AND statut = 'titree'`, [id]);
  if (dejaTitrees.n) throw httpError(409, `${dejaTitrees.n} échéance(s) déjà titrée(s) dans SEDIT : annulation impossible`);
  await db.tx(async (tx) => {
    await tx.run(`UPDATE ${t('echeances')} SET statut = COALESCE(filien_statut_avant, 'echue_non_emise'), filien_export_id = NULL, filien_mouvement = NULL, filien_titre_interne = NULL, filien_statut_avant = NULL, updated_at = now() WHERE filien_export_id = $1`, [id]);
    await tx.run(`UPDATE ${t('filien_exports')} SET statut = 'annule', annule_par = $2, annule_le = now(), annule_motif = $3 WHERE id = $1`, [id, user.username, motif]);
    await tx.run(`UPDATE ${t('campagnes')} SET facturee_le = NULL, facturee_par = NULL, filien_export_id = NULL WHERE id = $1`, [exp.campagne_id]);
    await tx.run(`INSERT INTO ${t('campagne_journal')}(campagne_id, action, motif, utilisateur) VALUES ($1,'annulation_facturation',$2,$3)`, [exp.campagne_id, `Export ${exp.nom} annulé : ${motif}`, user.username]);
    await audit.log(user, 'filien.cancelled', 'campagne', exp.campagne_id, { motif, details: { export: id } }, tx);
  });
  // Le dossier n'est pas effacé (SEDIT a pu le lire) : il est seulement renommé pour ne pas être réimporté par erreur.
  let dossier = exp.dossier;
  let d;
  try { d = ouvrirDepot(await lireConfig()); await d.renommer(exp.nom, `${exp.nom}_ANNULE`); dossier = `${exp.dossier}_ANNULE`; } catch { /* dossier absent, verrouillé ou dépôt reparamétré */ } finally { d?.fermer(); }
  return { ok: true, dossier };
}

module.exports = { publique, ouvrirDepot, lireConfig, ecrireConfig, verifierConfig, listerImputations, remplacerImputations, testerDepot, apercu, generer, listerExports, lireExport, annuler,
  construire, imputationPour, DEFAUTS, RUBRIQUES, racineDepot, cheminSedit };
