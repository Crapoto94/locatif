// Tests de la logique d'échéancier : node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculer, periodes, montantsActifs } = require('../src/modules/echeancier/echeancier.service');

const cond = [
  { rubrique_code: 'loyer', montant: 680, date_effet: '2026-01-01', date_fin: null },
  { rubrique_code: 'provision_charges', montant: 60, date_effet: '2026-01-01', date_fin: null },
];
const base = { gratuit: false, periodicite: 'mensuelle', date_debut: '2026-01-15', date_entree: '2026-01-15', date_fin: null };

test('prorata au jour à l\'entrée en cours de mois (17/31 jours)', () => {
  const [e] = calculer(base, cond, '2026-01-01', '2026-01-31');
  assert.equal(e.prorata, true);
  assert.equal(e.prorata_jours, 17);
  assert.equal(e.prorata_base, 31);
  assert.equal(e.montant_loyer, Math.round(680 * 17 / 31 * 100) / 100);
  assert.equal(e.montant_total, Math.round((e.montant_loyer + e.montant_charges) * 100) / 100);
});

test('mois complet sans prorata', () => {
  const e = calculer(base, cond, '2026-01-01', '2026-02-28')[1];
  assert.equal(e.prorata, false);
  assert.equal(e.montant_total, 740);
});

test('prorata à la sortie en cours de mois', () => {
  const [e] = calculer({ ...base, date_entree: '2025-01-01', date_sortie: '2026-03-10' }, cond, '2026-03-01', '2026-03-31');
  assert.equal(e.prorata_jours, 10);
  assert.equal(e.prorata_base, 31);
});

test('aucune échéance hors de la période d\'occupation', () => {
  assert.equal(calculer({ ...base, date_sortie: '2026-02-10' }, cond, '2026-03-01', '2026-04-30').length, 0);
  assert.equal(calculer(base, cond, '2025-11-01', '2025-12-31').length, 0);
});

test('contrat gratuit : pas d\'échéancier', () => {
  assert.equal(calculer({ ...base, gratuit: true }, cond, '2026-01-01', '2026-06-30').length, 0);
});

test('périodicité trimestrielle : périodes alignées sur le trimestre civil', () => {
  const p = periodes('trimestrielle', '2026-02-10', '2026-09-30');
  assert.deepEqual(p.map((x) => x.debut), ['2026-01-01', '2026-04-01', '2026-07-01']);
  assert.equal(p[0].fin, '2026-03-31');
});

test('année bissextile : février sur 29 jours', () => {
  const [e] = calculer({ ...base, date_entree: '2028-02-15', date_debut: '2028-02-15' }, cond, '2028-02-01', '2028-02-29');
  assert.equal(e.prorata_base, 29);
  assert.equal(e.prorata_jours, 15);
});

test('montant actif selon la date d\'effet (révision en cours d\'année)', () => {
  const revise = [
    { rubrique_code: 'loyer', montant: 680, date_effet: '2026-01-01', date_fin: '2026-06-30' },
    { rubrique_code: 'loyer', montant: 700, date_effet: '2026-07-01', date_fin: null },
  ];
  assert.equal(montantsActifs(revise, '2026-05-01').loyer, 680);
  assert.equal(montantsActifs(revise, '2026-07-01').loyer, 700);
});

test('quantité × tarif unitaire quand le montant est nul (CFI-004)', () => {
  const m = montantsActifs([{ rubrique_code: 'redevance', montant: 0, quantite: 20, tarif_unitaire: 12.5, date_effet: null, date_fin: null }], '2026-01-01');
  assert.equal(m.loyer, 250);
});
