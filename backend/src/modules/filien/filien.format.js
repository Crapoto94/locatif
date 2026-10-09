// FILIEN (interface SEDIT GF « Finances amont », BL 2023.1) — mise en forme du fichier texte. Module PUR : aucune dépendance
// à la base ni au disque, pour être testé seul. Règles : voir la skill « filien » (C:\dev\_skills\filien\SKILL.md).
//
// Structure produite (une recette = un mouvement ; plusieurs lignes /51/ quand plusieurs imputations) :
//   /##/PARAM/<organisme>/<budget>/<exercice>/<avancement>/<O|N>/<O|N>/<O|N>
//   /##/
//   /01/…/21/ (en-tête) · /26/…/266/ (PJ) · /44/N · /**/ /500/P… (détails ASAP) · /--/ /51/… /541/ /542/ /57/ /66/
//   /##/

const MAX = { id: 10, tiers: 10, libelle: 40, pjNom: 40, pjFichier: 100, pjChemin: 255, detail: 200, ligne: 40, titre: 6 };

// ISO-8859-1 obligatoire (l'UTF-8 corrompt les accents dans SEDIT). Les caractères hors Latin-1 sont translittérés, jamais perdus en « ? » si on peut l'éviter.
const TRANSLIT = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '€': 'EUR', 'œ': 'oe', 'Œ': 'OE', ' ': ' ', ' ': ' ', '•': '-' };
function latin1(s) {
  let out = '';
  for (const ch of String(s ?? '').replace(/[\r\n\t]+/g, ' ').normalize('NFC')) {
    if (TRANSLIT[ch] !== undefined) { out += TRANSLIT[ch]; continue; }
    if (ch.charCodeAt(0) <= 0xff) { out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base.length === 1 && base.charCodeAt(0) <= 0xff ? base : '?';
  }
  return out.replace(/ {2,}/g, ' ').trim();
}
const cut = (s, n) => latin1(s).slice(0, n).trim();
const pad = (s, n) => latin1(s).slice(0, n).padEnd(n, ' ');

// Montants en CENTIMES entiers en interne (pas de dérive flottante) ; sortie « 1234,56 », virgule seule autorisée.
const cents = (x) => Math.round(Number(x || 0) * 100);
const montant = (c) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`;
// JJMMAAAA depuis une date ISO AAAA-MM-JJ
const dateJJMMAAAA = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}${m}${y}`; };

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Remplace {mois} {annee} {contrat} {contractant} {bien} ; les balises inconnues sont laissées telles quelles.
function modele(tpl, v) { return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m)); }
const moisAnnee = (periode) => { const [y, m] = String(periode).split('-'); return { mois: MOIS[Number(m) - 1] || m, annee: y }; };

// Compteur « préfixe + chiffres » (LOC00012 → LOC00013) : le nombre de chiffres est conservé.
function suivant(valeur, n = 1) {
  const m = String(valeur || '').match(/^(.*?)(\d+)$/);
  if (!m) return String(valeur || '');
  return m[1] + String((parseInt(m[2], 10) || 0) + n).padStart(m[2].length, '0');
}
const numeroApres = (valeur, i) => suivant(valeur, i);

function entete(p) {
  return `/##/PARAM/${p.organisme}/${p.budget}/${p.exercice}/${p.avancement}/${p.rejetDispo ? 'O' : 'N'}/${p.rejetCA ? 'O' : 'N'}/${p.rejetMarche ? 'O' : 'N'}`;
}

// Un bloc de PJ n°i (1..5) : /26/ désignation, /261/ nom, /262/ support, /263/ chemin, /264/ type de pièce, /265/ format, /266/ type de document.
function blocPj(pj, i) {
  const base = 25 + i; const sub = base * 10;
  const l = [`/${base}/${cut(pj.nom, MAX.pjNom)}`, `/${sub + 1}/${cut(pj.fichier || pj.nom, MAX.pjFichier)}`, `/${sub + 2}/${pj.support || '01'}`];
  if ((pj.support || '01') === '01' || pj.support === '04') l.push(`/${sub + 3}/${cut(pj.chemin, MAX.pjChemin)}`);
  if (pj.typePiece) l.push(`/${sub + 4}/${cut(pj.typePiece, 3)}`);
  if (pj.format) l.push(`/${sub + 5}/${cut(pj.format, 2)}`);
  if (pj.typeDocument) l.push(`/${sub + 6}/${cut(pj.typeDocument, 10)}`);
  return l;
}

function lignesMouvement(m) {
  const l = [];
  l.push(`/01/${cut(m.id, MAX.id)}`, `/02/${m.type || 'R'}`, `/03/${cut(m.tiers, MAX.tiers)}`, `/04/${cut(m.libelle, MAX.libelle)}`, `/05/${m.calendrier}`,
    `/06/${m.monnaie}`, `/10/${m.existant}`, `/11/${m.preBordereau}`, `/12/C`, `/13/${String(m.titreInterne).slice(0, MAX.titre)}`, `/20/${cut(m.objet, MAX.libelle)}`);
  if (m.complement) l.push(`/21/${cut(m.complement, MAX.libelle)}`);
  (m.pjs || []).slice(0, 5).forEach((pj, i) => l.push(...blocPj(pj, i + 1)));
  l.push('/44/N');
  if (m.solidaires?.length) {
    l.push('/183/O');
    for (const code of m.solidaires) l.push('/$$/', `/400/${cut(code, MAX.tiers)}`);
  }
  for (const d of m.details || []) {
    l.push('/**/', '/500/P', `/501/${String(d.ordre).padStart(3, '0')}`, `/502/${cut(d.libelle, MAX.detail)}`, `/503/${dateJJMMAAAA(d.debut)}`, `/504/${dateJJMMAAAA(d.fin)}`,
      '/505/1,00', `/506/${montant(d.cents)}`);
  }
  for (const [i, ln] of m.lignes.entries()) {
    const im = ln.imputation;
    l.push('/--/', `/51/${String(i + 1).padStart(2, '0')}`,
      `/541/${pad(im.chapitre, 10)}${pad(im.nature, 10)}${pad(im.fonction, 10)}${pad(im.codeInterne, 10)}${cut(im.typeMouvement || 'R', 1)}${cut(im.sens || 'R', 1)}`,
      ...((im.structure || im.gestionnaire || im.destinataire) ? [`/542/${pad(im.structure, 10)}${pad(im.gestionnaire, 10)}${pad(im.destinataire, 10)}`] : []),
      `/57/${cut(ln.libelle, MAX.ligne)}`, `/66/${montant(ln.cents)}`);
  }
  l.push('/##/');
  return l;
}

// Contenu complet du fichier (chaîne JS ; à écrire avec l'encodage 'latin1').
function generer(params, mouvements) {
  const out = [entete(params), '/##/'];
  for (const m of mouvements) out.push(...lignesMouvement(m));
  return `${out.join('\n')}\n`;
}

// Contrôle de cohérence d'un mouvement AVANT écriture : retourne la liste des problèmes (vide = conforme à la spec).
function controler(m) {
  const e = [];
  if (!m.tiers) e.push('code tiers SEDIT manquant (/03/)');
  else if (String(m.tiers).length > MAX.tiers) e.push(`code tiers « ${m.tiers} » trop long (${MAX.tiers} caractères maximum)`);
  if (!/^[A-Za-z0-9_-]{1,10}$/.test(String(m.id || ''))) e.push(`numéro de mouvement invalide (/01/ : 10 caractères maximum) : « ${m.id} »`);
  if (!m.lignes?.length) e.push('aucune ligne de mouvement');
  for (const ln of m.lignes || []) {
    if (ln.cents <= 0) e.push(`montant ${montant(ln.cents)} € sur « ${ln.libelle} » : doit être strictement positif`);
    const im = ln.imputation || {};
    if (!im.chapitre || !im.nature) e.push(`imputation incomplète pour « ${ln.libelle} » (chapitre et nature obligatoires, /541/)`);
    for (const k of ['chapitre', 'nature', 'fonction', 'codeInterne', 'structure', 'gestionnaire', 'destinataire']) if (String(im[k] || '').length > 10) e.push(`${k} « ${im[k]} » dépasse 10 caractères (/541/ /542/)`);
  }
  const total = (m.lignes || []).reduce((s, l) => s + l.cents, 0);
  if ((m.details || []).length) {
    const det = m.details.reduce((s, d) => s + d.cents, 0);
    if (det !== total) e.push(`détails de prestation (${montant(det)}) ≠ total des lignes (${montant(total)})`);
  }
  if ((m.pjs || []).length > 5) e.push('plus de 5 pièces jointes (seules les 5 premières sont prises en compte)');
  for (const pj of m.pjs || []) if ((pj.support || '01') === '01' && !pj.chemin) e.push(`PJ « ${pj.nom} » : chemin obligatoire pour le support 01`);
  if (!/^\d{1,6}$/.test(String(m.titreInterne))) e.push(`n° de titre interne invalide (/13/ : 6 chiffres) : « ${m.titreInterne} »`);
  return e;
}

module.exports = { generer, controler, entete, latin1, cut, cents, montant, dateJJMMAAAA, modele, moisAnnee, suivant, numeroApres, MAX };
