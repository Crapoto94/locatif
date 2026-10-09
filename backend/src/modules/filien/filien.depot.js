// Dépôt des fichiers FILIEN : dossier local / monté (Windows : \\serveur\partage géré par l'OS) ou partage SAMBA/SMB
// avec identifiants (obligatoire sous Linux/Docker, où un chemin UNC n'est pas un dossier). Chemins relatifs à la racine du dépôt.
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const SEP = String.fromCharCode(92); // « \ »
const estUnc = (p) => /^(\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(String(p || ''));
const segments = (rel) => String(rel).split(/[\\/]+/).filter(Boolean);

function smb(cfg, motDePasse) {
  const parts = segments(cfg.dossier_depot);
  const SMB2 = require('smb2');
  const c = new SMB2({ share: `${SEP}${SEP}${parts[0]}${SEP}${parts[1]}`, domain: cfg.smb_domaine || 'WORKGROUP', username: cfg.smb_utilisateur, password: motDePasse, autoCloseTimeout: 0 });
  const op = (n) => promisify(c[n].bind(c));
  const [mkdir, writeFile, readFile, exists, rename, readdir, unlink, rmdir] = ['mkdir', 'writeFile', 'readFile', 'exists', 'rename', 'readdir', 'unlink', 'rmdir'].map(op);
  const base = parts.slice(2);
  const abs = (rel) => [...base, ...segments(rel)].join(SEP);
  const nettoyer = async (dir) => {
    for (const nom of await readdir(dir)) {
      const f = `${dir}${SEP}${nom}`;
      try { await unlink(f); } catch { await nettoyer(f); }
    }
    await rmdir(dir);
  };
  return {
    mode: 'smb',
    async mkdirp(rel) {
      let cur = '';
      for (const s of [...base, ...segments(rel)]) {
        cur = cur ? `${cur}${SEP}${s}` : s;
        if (!(await exists(cur).catch(() => false))) await mkdir(cur).catch((e) => { if (e.code !== 'STATUS_OBJECT_NAME_COLLISION') throw e; });
      }
    },
    ecrire: (rel, buf) => writeFile(abs(rel), buf),
    lire: (rel) => readFile(abs(rel)),
    renommer: (a, b) => rename(abs(a), abs(b)),
    supprimerDossier: (rel) => nettoyer(abs(rel)),
    fermer: () => { try { c.close(); } catch { /* déjà fermé */ } },
  };
}

function local(racine) {
  const abs = (rel) => { const f = path.resolve(racine, ...segments(rel)); if (!f.startsWith(path.resolve(racine))) throw new Error('Chemin hors du dépôt'); return f; };
  return {
    mode: 'dossier',
    mkdirp: (rel) => fs.promises.mkdir(abs(rel), { recursive: true }),
    ecrire: (rel, buf) => fs.promises.writeFile(abs(rel), buf),
    lire: (rel) => fs.promises.readFile(abs(rel)),
    renommer: (a, b) => fs.promises.rename(abs(a), abs(b)),
    supprimerDossier: (rel) => fs.promises.rm(abs(rel), { recursive: true, force: true }),
    fermer() {},
  };
}

// motDePasse : en clair (déchiffré par l'appelant). SMB dès qu'un utilisateur est paramétré et que le dépôt est un chemin UNC.
function ouvrir(cfg, racineLocale, motDePasse) {
  if (cfg.smb_utilisateur && estUnc(cfg.dossier_depot)) return smb(cfg, motDePasse);
  if (estUnc(cfg.dossier_depot) && process.platform !== 'win32') {
    throw new Error('chemin UNC inutilisable sans identifiants SAMBA sur ce serveur (Linux/Docker) : renseigner utilisateur et mot de passe SMB');
  }
  return local(racineLocale);
}

module.exports = { ouvrir, estUnc };
