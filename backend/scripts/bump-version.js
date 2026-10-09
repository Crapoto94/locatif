// Montée de version automatique, appelée par le hook git « pre-commit » (.githooks/pre-commit).
//
// SCHÉMA DES NUMÉROS : « 0.N ». La version démarre à 0.1 ; CHAQUE commit ajoute 1 à N (0.1 → 0.2 → 0.3 …).
// Le « 0. » signifie « application en construction » : le passage à 1.0 se décide à la main (modifier "version"
// dans backend/version.json, le hook repartira de là).
// COMMENTAIRE DE VERSION : avant de committer, rédiger backend/NOUVEAUTE.md — 1re ligne = titre, suite = commentaire
// (ce que voit l'utilisateur dans « Nouveautés », menu de gauche). Le fichier est consommé par le commit puis supprimé.
// Sans NOUVEAUTE.md, le titre est un résumé des fichiers modifiés (à éviter : peu parlant).
// [Le message du commit n'est pas lisible en pre-commit ; or seul ce hook peut ajouter version.json au commit en cours.]
// Un commit sans fichier indexé autre que version.json / NOUVEAUTE.md ne monte pas la version.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FICHIER = path.join(__dirname, '..', 'version.json');
const NOTE = path.join(__dirname, '..', 'NOUVEAUTE.md');
const indexes = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => !/backend\/(version\.json|NOUVEAUTE\.md)$/.test(f));
if (!indexes.length) process.exit(0);

let titre; let notes = '';
if (fs.existsSync(NOTE)) {
  const l = fs.readFileSync(NOTE, 'utf8').split(/\r?\n/);
  titre = l[0].replace(/^#+\s*/, '').trim(); notes = l.slice(1).join('\n').trim();
  fs.rmSync(NOTE);
}
if (!titre) titre = `Mise à jour (${indexes.length} fichier${indexes.length > 1 ? 's' : ''} : ${indexes.slice(0, 3).map((f) => path.basename(f)).join(', ')}${indexes.length > 3 ? '…' : ''})`;

const v = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const [maj, min] = String(v.version).split('.').map(Number);
const suivante = `${maj}.${min + 1}`;
v.version = suivante;
v.historique.unshift({ version: suivante, date: new Date().toISOString().slice(0, 10), titre, notes });
fs.writeFileSync(FICHIER, `${JSON.stringify(v, null, 2)}\n`);
console.log(`[version] ${maj}.${min} → ${suivante} — ${titre}`);
