// Répare les documents repris de SEDIT dont le fichier n'existe plus dans le stockage actif
// (ex. base partagée mais dossier backend/storage resté sur un autre poste, volume Docker neuf).
//   node scripts/reparer-documents.js [--dry-run]
// - Les chemins des pièces sont lus dans SEDIT via l'API centrale APM (/oracle/query, SELECT seul, type FINANCES) :
//   aucun accès Oracle direct. Le contenu est ensuite lu sur le partage UNC (le poste doit y avoir accès).
// - Idempotent : un fichier déjà présent dans le stockage n'est jamais retouché.
// - Les documents sans astech_id « sedit:… » ne peuvent pas être reconstitués : ils sont seulement listés.
const fs = require('fs');
const { config, checkConfig } = require('../src/config');
const { db, t } = require('../src/db');
const store = require('../src/modules/documents/store/store');

async function oracleSelect(sql) {
  const url = `${config.apm.url.replace(/\/$/, '')}/api/v1/oracle/query`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': config.apm.key }, body: JSON.stringify({ type: 'FINANCES', sql }) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`APM ${r.status} : ${body?.error || 'réponse invalide'}`);
  return body;
}

(async () => {
  checkConfig();
  const dry = process.argv.includes('--dry-run');
  const docs = await db.all(`SELECT id, nom, mime, storage_key, astech_id, version FROM ${t('documents')} WHERE actif ORDER BY id`);
  const manquants = [];
  for (const d of docs) { try { await store.get(d.storage_key); } catch { manquants.push(d); } }
  const bilan = { total: docs.length, fichier_absent: manquants.length, repares: 0, non_reconstituables: 0, source_inaccessible: 0 };
  const echecs = [];

  const sedit = manquants.filter((d) => /^sedit:\d+$/.test(d.astech_id || ''));
  for (const d of manquants) if (!sedit.includes(d)) { bilan.non_reconstituables++; echecs.push(`#${d.id} ${d.nom} : pas de source de reprise`); }

  const chemins = new Map();
  for (let i = 0; i < sedit.length; i += 100) {
    const roos = sedit.slice(i, i + 100).map((d) => `'${d.astech_id.slice(6)}'`).join(',');
    for (const r of await oracleSelect(`SELECT TRIM(ROO_IMA_REF) AS ROO, CHEMIN_FICHIER FROM FI.PJ_PES WHERE TRIM(ROO_IMA_REF) IN (${roos})`)) chemins.set(r.ROO, r.CHEMIN_FICHIER);
  }

  for (const d of sedit) {
    try {
      const chemin = chemins.get(d.astech_id.slice(6));
      if (!chemin) throw new Error('pièce introuvable dans SEDIT');
      const buffer = await fs.promises.readFile(String(chemin));
      if (dry) { bilan.repares++; continue; }
      const r = await store.put({ buffer, nom: d.nom, mime: d.mime, folder: `documents/${d.id}` });
      await db.tx(async (tx) => {
        await tx.run(`UPDATE ${t('documents')} SET storage_key=$2, sha256=$3, taille=$4 WHERE id=$1`, [d.id, r.storageKey, r.sha256, r.taille]);
        await tx.run(`UPDATE ${t('document_versions')} SET storage_key=$2, sha256=$3, taille=$4 WHERE document_id=$1 AND version=$5`, [d.id, r.storageKey, r.sha256, r.taille, d.version]);
      });
      bilan.repares++;
    } catch (e) { bilan.source_inaccessible++; echecs.push(`#${d.id} ${d.nom} : ${e.code || ''} ${e.message}`); }
  }
  console.log(JSON.stringify({ ...bilan, dry_run: dry, echecs: echecs.slice(0, 10) }, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
