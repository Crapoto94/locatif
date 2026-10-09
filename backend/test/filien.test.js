// Tests du format FILIEN (pur, sans base) : node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const F = require('../src/modules/filien/filien.format');
const { imputationPour, cheminSedit } = require('../src/modules/filien/filien.service');

const params = { organisme: '01', budget: 'BA', exercice: 2026, avancement: '5', rejetDispo: true, rejetCA: false, rejetMarche: false };
const imp = { chapitre: '70', nature: '752', fonction: '01', codeInterne: '', typeMouvement: 'R', sens: 'R', structure: '', gestionnaire: '', destinataire: '' };
const mouvement = (o = {}) => ({
  id: 'LOC00001', type: 'R', tiers: '0002093', libelle: 'Loyer octobre 2026', calendrier: '01', monnaie: 'E', existant: 'N', preBordereau: '800', titreInterne: '00001',
  objet: 'Loyer octobre 2026 - 000004', complement: 'PAVILLON 23 RUE ANTOINE THOMAS', solidaires: [],
  pjs: [{ nom: 'Détail de facture', fichier: 'Detail_000004.pdf', support: '01', chemin: '\\\\srv\\filien\\RUN\\Detail_000004.pdf', typePiece: '011' }],
  details: [{ ordre: 1, libelle: 'Loyer octobre 2026', debut: '2026-10-01', fin: '2026-10-31', cents: 19044 }],
  lignes: [{ cents: 19044, libelle: 'Loyer octobre 2026', imputation: imp }], ...o,
});

test('en-tête, séparateurs et ordre des blocs', () => {
  const l = F.generer(params, [mouvement()]).split('\n');
  assert.equal(l[0], '/##/PARAM/01/BA/2026/5/O/N/N');
  assert.equal(l[1], '/##/');
  assert.equal(l.at(-2), '/##/');
  assert.ok(l.indexOf('/**/') < l.indexOf('/--/'), 'détails /**/ avant la première ligne /--/');
  assert.equal(l.filter((x) => x === '/--/').length, 1);
  assert.ok(l.includes('/12/C') && l.includes('/13/00001') && l.includes('/44/N'));
});

test('/541/ fait exactement 42 caractères ; /542/ est omis quand il est vide', () => {
  const l = F.generer(params, [mouvement()]).split('\n');
  assert.equal(l.find((x) => x.startsWith('/541/')).length, 5 + 42);
  assert.equal(l.find((x) => x.startsWith('/541/')), `/541/${'70'.padEnd(10)}${'752'.padEnd(10)}${'01'.padEnd(10)}${''.padEnd(10)}RR`);
  assert.ok(!l.some((x) => x.startsWith('/542/')));
  const avec = F.generer(params, [mouvement({ lignes: [{ cents: 19044, libelle: 'x', imputation: { ...imp, structure: 'ORGA', gestionnaire: 'DSF' } }] })]).split('\n');
  assert.equal(avec.find((x) => x.startsWith('/542/')).length, 5 + 30);
});

test('deux rubriques = deux lignes /51/ numérotées, détails assortis', () => {
  const m = mouvement({
    details: [{ ordre: 1, libelle: 'Loyer', debut: '2026-10-01', fin: '2026-10-31', cents: 10150 }, { ordre: 2, libelle: 'Charges', debut: '2026-10-01', fin: '2026-10-31', cents: 1234 }],
    lignes: [{ cents: 10150, libelle: 'Loyer', imputation: imp }, { cents: 1234, libelle: 'Charges', imputation: { ...imp, nature: '7087' } }],
  });
  const t = F.generer(params, [m]);
  assert.deepEqual(t.split('\n').filter((x) => x.startsWith('/51/')), ['/51/01', '/51/02']);
  assert.ok(t.includes('/506/101,50') && t.includes('/506/12,34') && t.includes('/66/12,34'));
  assert.deepEqual(F.controler(m), []);
});

test('montants : virgule, deux décimales, calcul en centimes sans dérive', () => {
  assert.equal(F.montant(F.cents(1234.5)), '1234,50');
  assert.equal(F.montant(F.cents(0.1 + 0.2)), '0,30');
  assert.equal(F.montant(F.cents(100.005)), '100,01');
  assert.equal(F.cents('12,5'.replace(',', '.')), 1250);
});

test('dates JJMMAAAA et compteurs', () => {
  assert.equal(F.dateJJMMAAAA('2026-10-01'), '01102026');
  assert.equal(F.suivant('LOC00009'), 'LOC00010');
  assert.equal(F.suivant('00099', 3), '00102');
  assert.equal(F.numeroApres('LOC00001', 2), 'LOC00003');
  assert.equal(F.suivant('SANSCHIFFRE'), 'SANSCHIFFRE');
});

test('Latin-1 : accents conservés, caractères hors Latin-1 translittérés, coupe à la longueur', () => {
  assert.equal(F.latin1('Œuvre « é » – ’x’ € à l’école'), "OEuvre « é » - 'x' EUR à l'école");
  assert.equal(F.cut('é'.repeat(50), 40).length, 40);
  const buf = Buffer.from(F.generer(params, [mouvement({ complement: 'Théâtre – Ça' })]), 'latin1');
  assert.ok(buf.includes(Buffer.from([0xe9])), 'é codé sur un octet (0xE9), pas en UTF-8');
  assert.ok(!buf.includes(Buffer.from([0xc3, 0xa9])));
});

test('libellés : chaque champ est coupé à 40 caractères', () => {
  const l = F.generer(params, [mouvement({ libelle: 'L'.repeat(60), objet: 'O'.repeat(60), complement: 'C'.repeat(60) })]).split('\n');
  for (const p of ['/04/', '/20/', '/21/']) assert.equal(l.find((x) => x.startsWith(p)).length, 4 + 40);
});

test('modèles de libellé', () => {
  assert.equal(F.modele('Loyer {mois} {annee} - {contrat}', { mois: 'octobre', annee: '2026', contrat: '000004' }), 'Loyer octobre 2026 - 000004');
  assert.equal(F.modele('{inconnu}', {}), '{inconnu}');
  assert.deepEqual(F.moisAnnee('2026-02'), { mois: 'février', annee: '2026' });
});

test('contrôles : tiers manquant, imputation incomplète, détails ≠ lignes, PJ sans chemin', () => {
  assert.match(F.controler(mouvement({ tiers: '' })).join('|'), /code tiers SEDIT manquant/);
  assert.match(F.controler(mouvement({ lignes: [{ cents: 19044, libelle: 'x', imputation: { ...imp, nature: '' } }] })).join('|'), /imputation incomplète/);
  assert.match(F.controler(mouvement({ details: [{ ordre: 1, libelle: 'x', debut: '2026-10-01', fin: '2026-10-31', cents: 1 }] })).join('|'), /détails de prestation/);
  assert.match(F.controler(mouvement({ pjs: [{ nom: 'a', fichier: 'a.pdf', support: '01', chemin: '' }] })).join('|'), /chemin obligatoire/);
  assert.match(F.controler(mouvement({ titreInterne: '1234567' })).join('|'), /titre interne/);
  assert.match(F.controler(mouvement({ lignes: [{ cents: 0, libelle: 'x', imputation: imp }] })).join('|'), /strictement positif/);
});

test('PJ : bloc /26x/ selon le rang, type de pièce sous la bonne balise', () => {
  const pjs = ['A', 'B', 'C', 'D'].map((n) => ({ nom: n, fichier: `${n}.pdf`, support: '01', chemin: `\\\\s\\${n}.pdf`, typePiece: n === 'D' ? '011' : '' }));
  const l = F.generer(params, [mouvement({ pjs })]).split('\n');
  for (const t of ['/26/A', '/271/B.pdf', '/283/\\\\s\\C.pdf', '/29/D', '/294/011']) assert.ok(l.includes(t), t);
  assert.ok(!l.some((x) => x.startsWith('/264/')), 'pas de type de pièce sur la PJ 1');
});

test('imputation : la ligne « type de contrat » prime sur la ligne générale ; inactive ignorée', () => {
  const imps = [{ actif: true, rubrique: 'loyer', type_contrat: null, nature: '752' }, { actif: true, rubrique: 'loyer', type_contrat: 'bailcc', nature: '7523' },
    { actif: false, rubrique: 'charges', type_contrat: null, nature: 'X' }];
  assert.equal(imputationPour(imps, 'loyer', 'bailcc').nature, '7523');
  assert.equal(imputationPour(imps, 'loyer', 'cop').nature, '752');
  assert.equal(imputationPour(imps, 'charges', 'cop'), null);
});

test('chemin vu par SEDIT : séparateur UNC / Windows ou POSIX selon la base', () => {
  assert.equal(cheminSedit({ chemin_sedit: '\\\\srv\\partage\\filien' }, 'RUN', 'a.pdf'), '\\\\srv\\partage\\filien\\RUN\\a.pdf');
  assert.equal(cheminSedit({ chemin_sedit: '/mnt/filien' }, 'RUN', 'a.pdf'), '/mnt/filien/RUN/a.pdf');
});

// Si la skill « filien » est installée à côté, le fichier produit doit passer son validateur sans erreur.
const validateur = path.join(__dirname, '..', '..', '..', '_skills', 'filien', 'validate-filien.js');
test('le fichier produit passe le validateur de la skill (si présent)', { skip: !fs.existsSync(validateur) }, () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'filien-t-')), 'test.filien.txt');
  fs.writeFileSync(f, Buffer.from(F.generer(params, [mouvement(), mouvement({ id: 'LOC00002', titreInterne: '00002' })]), 'latin1'));
  const r = spawnSync(process.execPath, [validateur, f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
