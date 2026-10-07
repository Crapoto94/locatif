// Adaptateur « filer » : dossier local ou partage UNC (\\serveur\partage). Sous Windows l'OS gère l'UNC ;
// sous Linux, monter le partage (CIFS) sur un chemin local. Réutilisé par le simulateur (racine locale dédiée).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const simRoot = () => path.join(__dirname, '..', '..', '..', '..', 'storage', '_simulateur');

// Nom de fichier sûr : pas de séparateur, pas de caractère interdit sous Windows, longueur bornée.
const safeName = (n) => String(n || 'fichier').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'fichier';
const safeSeg = (s) => String(s || '').split(/[\\/]+/).filter((x) => x && x !== '.' && x !== '..').map(safeName).join('/');

function create({ root, prefix }) {
  if (!root) throw new Error('Racine du filer non configurée');
  const abs = (rel) => {
    const full = path.resolve(root, rel);
    if (!full.startsWith(path.resolve(root))) throw new Error('Chemin hors de la racine de stockage');
    return full;
  };
  const keyToRel = (key) => key.slice(prefix.length + 1);

  return {
    prefix,
    async put({ buffer, nom, folder, replaceKey }) {
      // Nouvelle version : nom opaque horodaté, l'ancien fichier est conservé (historique des versions).
      const rel = `${safeSeg(folder) || 'divers'}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName(nom)}`;
      const full = abs(rel);
      try {
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await fs.promises.writeFile(full, buffer);
      } catch (e) {
        throw new Error(`Stockage injoignable ou non inscriptible (${e.code || e.message}) : ${root}`);
      }
      return { key: `${prefix}:${rel.replace(/\\/g, '/')}` };
    },
    async get(key) {
      const full = abs(keyToRel(key));
      try { return { buffer: await fs.promises.readFile(full) }; }
      catch (e) { throw new Error(`Fichier introuvable dans le stockage (${e.code || e.message})`); }
    },
    async remove(key) { await fs.promises.rm(abs(keyToRel(key)), { force: true }); },
    async test() {
      try { await fs.promises.mkdir(root, { recursive: true }); }
      catch (e) { throw new Error(`Racine inaccessible (${e.code || e.message}) : ${root}`); }
      const probe = abs(`_test/${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);
      await fs.promises.mkdir(path.dirname(probe), { recursive: true });
      await fs.promises.writeFile(probe, 'test');
      const back = await fs.promises.readFile(probe, 'utf8');
      await fs.promises.rm(probe, { force: true });
      if (back !== 'test') throw new Error('Relecture du fichier témoin incorrecte');
      return { message: `Écriture et relecture réussies sur ${root}` };
    },
    async browse(rel) {
      const dir = abs(safeSeg(rel));
      const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
      const out = [];
      for (const e of entries) {
        const st = await fs.promises.stat(path.join(dir, e.name)).catch(() => null);
        out.push({ nom: e.name, dossier: e.isDirectory(), taille: e.isDirectory() ? null : st?.size, modifie: st?.mtime });
      }
      return out.sort((a, b) => Number(b.dossier) - Number(a.dossier) || a.nom.localeCompare(b.nom));
    },
  };
}

module.exports = { create, simRoot };
