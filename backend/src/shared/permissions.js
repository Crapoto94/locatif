// Catalogue des permissions et profils initiaux (ADM-013).
// Les permissions non décidées par le manifeste sont fermées sauf pour ADMIN_GL ; la matrice reste
// modifiable à l'écran /admin/droits (ADM-005 / ADM-006 : À CONFIRMER MÉTIER).

const PERMISSIONS = [
  ['biens.read', 'Consulter les biens'], ['biens.write', 'Créer / modifier les biens'],
  ['contractants.read', 'Consulter les contractants'], ['contractants.write', 'Créer / modifier les contractants'],
  ['contrats.read', 'Consulter les contrats'], ['contrats.write', 'Créer / modifier les contrats'],
  ['contrats.cloturer', 'Résilier / clôturer un contrat'],
  ['echeancier.read', "Consulter l'échéancier"], ['echeancier.write', "Modifier l'échéancier"],
  ['revisions.read', 'Consulter les révisions'], ['revisions.write', 'Simuler / appliquer des révisions'],
  ['charges.read', 'Consulter les charges'], ['charges.write', 'Saisir charges et régularisations'],
  ['documents.read', 'Consulter les documents'], ['documents.write', 'Déposer / modifier des documents'],
  ['documents.sensible', 'Accéder aux pièces sensibles (identité, RIB)'],
  ['documents.generer', 'Générer des documents (modèles Word / PDF)'],
  ['alertes.read', 'Consulter les alertes'], ['alertes.write', 'Traiter / réaffecter les alertes'],
  ['campagne.read', 'Consulter la campagne mensuelle'], ['campagne.write', 'Préparer / contrôler la campagne'],
  ['campagne.valider', 'Valider la campagne (validation locative)'],
  ['etats.read', 'États et statistiques'], ['audit.read', "Historique d'audit"],
  ['referentiels.read', 'Consulter les référentiels'], ['referentiels.write', 'Administrer les référentiels'],
  ['modeles.admin', 'Administrer les modèles Word'],
  ['admin.users', 'Gérer comptes et droits'], ['admin.ged', 'Paramétrer la GED / le stockage'],
  ['admin.reprise', "Lancer / contrôler la reprise ASTECH"],
].map(([code, libelle]) => ({ code, libelle }));

const ALL = PERMISSIONS.map((p) => p.code);
const READ = ALL.filter((p) => p.endsWith('.read'));

const PROFILS = [
  { code: 'ADMIN_GL', libelle: 'Admin Gestion Locative', permissions: ALL },
  {
    code: 'AFLC', libelle: 'AFLC / Gestion Locative',
    // Lecture + écritures opérationnelles + pièces sensibles et modèles Word (explicitement validés, §19).
    permissions: [...READ, 'biens.write', 'contractants.write', 'contrats.write', 'contrats.cloturer', 'echeancier.write',
      'revisions.write', 'charges.write', 'documents.write', 'documents.sensible', 'documents.generer', 'alertes.write',
      'campagne.write', 'campagne.valider', 'modeles.admin'],
  },
  { code: 'DSF', libelle: 'Direction des finances', permissions: [...READ, 'documents.sensible'] },
  { code: 'DSI', libelle: 'DSI (administration technique)', permissions: [...READ, 'admin.ged', 'admin.reprise'] },
  { code: 'LECTURE', libelle: 'Consultation', permissions: READ.filter((p) => !['audit.read'].includes(p)) },
];

module.exports = { PERMISSIONS, PROFILS, ALL };
