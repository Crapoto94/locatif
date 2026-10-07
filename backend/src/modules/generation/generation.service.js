// Génération documentaire (DOC-010 à DOC-015) : modèles Word personnalisables (balises {nom}), version PDF automatique.
// - Modèle déposé par l'administration (docxtemplater) ou modèle intégré (DOCX construit ici).
// - PDF : LibreOffice (SOFFICE_PATH) si disponible ; à défaut, rendu pdfkit du texte du document.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const PDFDocument = require('pdfkit');
const { config } = require('../../config');
const { db, t } = require('../../db');
const store = require('../documents/store/store');
const docs = require('../documents/documents.service');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const eur = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateFr = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '');

// DOCX minimal valide à partir de paragraphes [{texte, gras?, titre?}]
function buildDocx(paragraphes) {
  const p = paragraphes.map((x) => {
    const rpr = `${x.gras || x.titre ? '<w:b/>' : ''}${x.titre ? '<w:sz w:val="32"/>' : ''}`;
    return `<w:p><w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(x.texte)}</w:t></w:r></w:p>`;
  }).join('');
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function pdfFromParagraphs(paragraphes) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    paragraphes.forEach((x) => {
      doc.font(x.gras || x.titre ? 'Helvetica-Bold' : 'Helvetica').fontSize(x.titre ? 16 : 10.5).text(x.texte, { paragraphGap: x.titre ? 12 : 6 });
    });
    doc.end();
  });
}

function sofficePdf(docxBuffer) {
  return new Promise((resolve) => {
    if (!config.sofficePath) return resolve(null);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locatif-'));
    const src = path.join(dir, 'document.docx');
    fs.writeFileSync(src, docxBuffer);
    execFile(config.sofficePath, ['--headless', '--convert-to', 'pdf', '--outdir', dir, src], { timeout: 60000 }, (err) => {
      try { resolve(err ? null : fs.readFileSync(path.join(dir, 'document.pdf'))); } catch { resolve(null); }
      finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });
}

// ---- Variables métier ----
async function contexteContrat(contratId) {
  const k = await db.get(`SELECT * FROM ${t('contrats')} WHERE id = $1`, [contratId]);
  if (!k) return null;
  const [cts, biens] = await Promise.all([
    db.all(`SELECT ct.* FROM ${t('contrat_contractants')} cc JOIN ${t('contractants')} ct ON ct.id = cc.contractant_id WHERE cc.contrat_id = $1`, [contratId]),
    db.all(`SELECT b.* FROM ${t('contrat_biens')} cb JOIN ${t('biens')} b ON b.id = cb.bien_id WHERE cb.contrat_id = $1`, [contratId]),
  ]);
  return {
    contrat: k.numero, objet_contrat: k.objet || '', date_jour: dateFr(new Date().toISOString()),
    contractant: cts.map((c) => [c.prenom, c.nom].filter(Boolean).join(' ')).join(', '),
    adresse_contractant: cts.map((c) => [c.adresse, c.code_postal, c.ville].filter(Boolean).join(' ')).filter(Boolean).join(' ; '),
    bien: biens.map((b) => b.designation).join(', '), adresse_bien: biens.map((b) => [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ')).filter(Boolean).join(' ; '),
    _contrat: k,
  };
}

const MODELES = {
  async revision_loyer(ctx, params) {
    const rev = await db.get(
      `SELECT r.*, ip.libelle AS indice_prec, ip.valeur AS valeur_prec, inw.libelle AS indice_nouv, inw.valeur AS valeur_nouv FROM ${t('revisions')} r
         LEFT JOIN ${t('indices_valeurs')} ip ON ip.id = r.indice_prec_id LEFT JOIN ${t('indices_valeurs')} inw ON inw.id = r.indice_nouv_id
       WHERE r.contrat_id = $1 ${params.revision_id ? 'AND r.id = $2' : ''} ORDER BY r.id DESC LIMIT 1`, params.revision_id ? [ctx._contrat.id, params.revision_id] : [ctx._contrat.id]);
    if (!rev) throw Object.assign(new Error('Aucune révision appliquée pour ce contrat'), { status: 409 });
    return {
      vars: { ...ctx, ancien_loyer: eur(rev.montant_avant), nouveau_loyer: eur(rev.montant_apres), indice_precedent: `${rev.indice_prec || ''} (${rev.valeur_prec ?? ''})`,
        indice_nouveau: `${rev.indice_nouv || ''} (${rev.valeur_nouv ?? ''})`, pourcentage: `${rev.pourcentage ?? ''} %`, date_application: dateFr(rev.date_application) },
      titre: 'Révision du loyer',
      paragraphes: (v) => [
        { texte: 'Révision du loyer', titre: true }, { texte: `Contrat ${v.contrat} — ${v.bien}` }, { texte: v.adresse_bien },
        { texte: `Madame, Monsieur ${v.contractant},` },
        { texte: `Conformément aux stipulations du contrat, le loyer est révisé à compter du ${v.date_application} sur la base de l'indice ${v.indice_nouveau}, l'indice de référence étant ${v.indice_precedent}.` },
        { texte: `Ancien loyer : ${v.ancien_loyer}` }, { texte: `Nouveau loyer : ${v.nouveau_loyer} (variation : ${v.pourcentage})`, gras: true },
        { texte: `Fait à Ivry-sur-Seine, le ${v.date_jour}.` },
      ],
    };
  },
  async regularisation_charges(ctx, params) {
    const reg = await db.get(`SELECT * FROM ${t('regularisations')} WHERE contrat_id = $1 AND annee = $2`, [ctx._contrat.id, params.annee]);
    if (!reg) throw Object.assign(new Error('Aucune régularisation enregistrée pour cette année'), { status: 409 });
    const detail = (reg.detail || []).map((l) => `${l.libelle} : ${eur(l.quote_part)}`).join(' ; ');
    return {
      vars: { ...ctx, annee: String(reg.annee), provisions: eur(reg.provisions_appelees), charges_reelles: eur(reg.charges_reelles), solde: eur(Math.abs(reg.solde)), sens: reg.solde > 0 ? 'à votre charge' : 'en votre faveur', detail },
      titre: 'Régularisation des charges',
      paragraphes: (v) => [
        { texte: `Régularisation des charges — exercice ${v.annee}`, titre: true }, { texte: `Contrat ${v.contrat} — ${v.bien}` },
        { texte: `Madame, Monsieur ${v.contractant},` },
        { texte: `Provisions appelées : ${v.provisions}` }, { texte: `Charges réelles imputables : ${v.charges_reelles}` },
        { texte: `Solde : ${v.solde} ${v.sens}.`, gras: true }, { texte: `Détail : ${v.detail}` },
        { texte: `Fait à Ivry-sur-Seine, le ${v.date_jour}.` },
      ],
    };
  },
};

async function modeleWord(code) {
  const m = await db.get(`SELECT * FROM ${t('modeles_documents')} WHERE code = $1 AND actif`, [code]);
  if (!m) return { m: null };
  if (!m.document_id) return { m, buffer: null };
  const d = await db.get(`SELECT * FROM ${t('documents')} WHERE id = $1 AND actif`, [m.document_id]);
  return { m, buffer: d ? (await store.get(d.storage_key)).buffer : null };
}

// Génère DOCX (+ PDF) et les enregistre dans la GED, liés au contrat.
async function generer(user, { code, contrat_id, params = {} }) {
  const def = MODELES[code];
  if (!def) throw Object.assign(new Error('Modèle inconnu'), { status: 400 });
  const ctx = await contexteContrat(contrat_id);
  if (!ctx) throw Object.assign(new Error('Contrat introuvable'), { status: 404 });
  const { vars, titre, paragraphes } = await def(ctx, params);
  const { m, buffer: tpl } = await modeleWord(code);
  if (!m) throw Object.assign(new Error('Modèle désactivé ou absent'), { status: 404 });

  let docx; let pdfSource = paragraphes(vars);
  if (tpl) { // modèle Word personnalisé : remplacement des balises {variable}
    const zip = new PizZip(tpl);
    const dt = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    dt.render(Object.fromEntries(Object.entries(vars).filter(([k]) => !k.startsWith('_'))));
    docx = dt.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } else docx = buildDocx(pdfSource);

  const base = `${titre} ${ctx.contrat}`.replace(/[\\/:*?"<>|]/g, '-');
  const links = [{ objet_type: 'contrat', objet_id: contrat_id }];
  const dDocx = await docs.create(user, { buffer: docx, nom: `${base}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', type_code: 'courrier', links });
  let pdfBuf = await sofficePdf(docx);
  if (!pdfBuf && !tpl) pdfBuf = await pdfFromParagraphs(pdfSource);
  const dPdf = pdfBuf ? await docs.create(user, { buffer: pdfBuf, nom: `${base}.pdf`, mime: 'application/pdf', type_code: 'courrier', links }) : null;
  return { docx: dDocx, pdf: dPdf, pdf_disponible: Boolean(dPdf), avertissement: dPdf ? null : 'PDF non produit : un modèle Word personnalisé nécessite LibreOffice (SOFFICE_PATH)' };
}

module.exports = { generer, MODELES: Object.keys(MODELES), buildDocx };
