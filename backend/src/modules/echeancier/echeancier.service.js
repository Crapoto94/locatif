// Génération de l'échéancier (ECH) : à échoir, mensuel ou trimestriel, prorata au jour à l'entrée / à la sortie.
// CONVENTION DE CONCEPTION (ECH-003) : prorata = jours d'occupation de la période / jours réels de la période.
const { db, t } = require('../../db');

const LOYER = ['loyer', 'redevance', 'indemnite_occupation', 'taxe_fonciere'];
const CHARGES = ['charges', 'provision_charges'];

const d = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
const iso = (dt) => dt.toISOString().slice(0, 10);
const addMonths = (dt, n) => { const x = new Date(dt); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const daysBetween = (a, b) => Math.round((b - a) / 86400000) + 1; // bornes incluses
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Périodes [debut, fin] couvrant [from, to], alignées sur le 1er du mois (ou du trimestre civil).
function periodes(periodicite, from, to) {
  const step = periodicite === 'trimestrielle' ? 3 : 1;
  let cur = d(from);
  cur = new Date(Date.UTC(cur.getUTCFullYear(), step === 3 ? Math.floor(cur.getUTCMonth() / 3) * 3 : cur.getUTCMonth(), 1));
  const out = [];
  while (cur <= d(to)) {
    const next = addMonths(cur, step);
    out.push({ debut: iso(cur), fin: iso(new Date(next - 86400000)) });
    cur = next;
  }
  return out;
}

const libellePeriode = (p, periodicite) => {
  const dt = d(p.debut);
  const mois = dt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return periodicite === 'trimestrielle' ? `T${Math.floor(dt.getUTCMonth() / 3) + 1} ${dt.getUTCFullYear()}` : mois.toUpperCase();
};

function montantsActifs(conditions, debut) {
  let loyer = 0; let charges = 0;
  for (const c of conditions) {
    const eff = c.date_effet ? String(c.date_effet).slice(0, 10) : '0000-01-01';
    const fin = c.date_fin ? String(c.date_fin).slice(0, 10) : '9999-12-31';
    if (eff > debut || fin < debut) continue;
    const m = c.montant > 0 ? Number(c.montant) : (c.quantite && c.tarif_unitaire ? Number(c.quantite) * Number(c.tarif_unitaire) : 0);
    if (LOYER.includes(c.rubrique_code)) loyer += m;
    else if (CHARGES.includes(c.rubrique_code)) charges += m;
  }
  return { loyer, charges };
}

// Calcule (sans écrire) les échéances d'un contrat sur [from, to].
function calculer(contrat, conditions, from, to) {
  if (contrat.gratuit) return [];
  const entree = contrat.date_entree || contrat.date_debut_quittancement || contrat.date_debut;
  const sortie = contrat.date_sortie || contrat.date_cloture || contrat.date_fin;
  const out = [];
  for (const p of periodes(contrat.periodicite || 'mensuelle', from, to)) {
    const debEff = entree && String(entree).slice(0, 10) > p.debut ? String(entree).slice(0, 10) : p.debut;
    const finEff = sortie && String(sortie).slice(0, 10) < p.fin ? String(sortie).slice(0, 10) : p.fin;
    if (debEff > finEff) continue; // hors occupation
    const base = daysBetween(d(p.debut), d(p.fin));
    const jours = daysBetween(d(debEff), d(finEff));
    const prorata = jours < base;
    const m = montantsActifs(conditions, debEff);
    const coef = prorata ? jours / base : 1;
    const loyer = round2(m.loyer * coef); const charges = round2(m.charges * coef);
    out.push({
      periode_debut: p.debut, periode_fin: p.fin, libelle: libellePeriode(p, contrat.periodicite),
      date_exigibilite: p.debut, // à échoir : exigible en début de période (CFI-008)
      montant_loyer: loyer, montant_charges: charges, montant_total: round2(loyer + charges),
      prorata, prorata_jours: prorata ? jours : null, prorata_base: prorata ? base : null,
    });
  }
  return out;
}

// Insère les échéances manquantes (idempotent sur contrat + début de période). Ne touche jamais une échéance existante.
async function generer(runner, contratId, from, to) {
  const contrat = await runner.get(`SELECT * FROM ${t('contrats')} WHERE id = $1`, [contratId]);
  if (!contrat) return { crees: 0 };
  const conditions = await runner.all(`SELECT * FROM ${t('conditions_financieres')} WHERE contrat_id = $1`, [contratId]);
  const existantes = new Set((await runner.all(`SELECT periode_debut FROM ${t('echeances')} WHERE contrat_id = $1`, [contratId])).map((r) => r.periode_debut));
  let crees = 0;
  for (const e of calculer(contrat, conditions, from, to)) {
    if (existantes.has(e.periode_debut)) continue;
    await runner.run(
      `INSERT INTO ${t('echeances')}(contrat_id, libelle, periode_debut, periode_fin, date_exigibilite, montant_loyer, montant_charges, montant_total,
         prorata, prorata_jours, prorata_base, statut, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'planifiee','app')`,
      [contratId, e.libelle, e.periode_debut, e.periode_fin, e.date_exigibilite, e.montant_loyer, e.montant_charges, e.montant_total, e.prorata, e.prorata_jours, e.prorata_base]);
    crees++;
  }
  return { crees };
}

module.exports = { calculer, generer, periodes, montantsActifs, round2, daysBetween, d, iso, addMonths };
