// Classification des documents par type (référentiel `type_document`) : le nom du fichier d'abord (abréviations métier comprises),
// puis le type de pièce SEDIT. Un document non reconnu reste « autre » / « pièce justificative », jamais rangé au hasard.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[_.]+/g, ' ').replace(/([a-z])([0-9])/gi, '$1 $2').replace(/([0-9])([a-z])/gi, '$1 $2').toLowerCase();

// Types de pièce SEDIT (FI.SEDIT_BUSAPP_GED_TYPE.IDENTIFIANT) rencontrés sur les tiers.
const PAR_TYPE_SEDIT = { 5: 'titre_recette', 7: 'rib', 69: 'decision_municipale', 70: 'contrat', 221: 'piece_justificative' };
const LIBELLE_VERS_TYPE_SEDIT = [[/titre/i, 5], [/identit.+bancaire/i, 7], [/d[ée]lib[ée]ration, arr[êe]t[ée], d[ée]cision/i, 69], [/contrat ou convention/i, 70], [/autres pi[èe]ces justificatives/i, 221]];

// Règles sur le nom, de la plus spécifique à la plus générale (DEC/DM = décision municipale, DEL = délibération, AOT/COP/COT = occupation).
const REGLES = [
  [/\b(rib|iban)\b|releve d identite bancaire/, 'rib'],
  [/identite|passeport|\bcni\b|titre de sejour/, 'piece_identite'],
  [/avenant/, 'avenant'],
  [/certadm|certificat adm/, 'certificat_administratif'],
  [/arrete/, 'arrete'],
  [/deliberation|\bdel\b/, 'deliberation'],
  [/decision|\bdec\b|\bdm\b/, 'decision_municipale'],
  [/\b(aot|cop|cot|mad)\b|\baot[a-z]|convention|autorisation d occupation|mise a disposition|occupation/, 'convention_occupation'],
  [/\bbail\b|contrat/, 'contrat'],
  [/kbis|extrait k/, 'kbis'],
  [/statuts?\b/, 'statuts'],
  [/\b(siren|siret|avis de situation)\b/, 'siren'],
  [/assurance|attestation/, 'attestation_assurance'],
  [/quittance|avis d echeance/, 'quittance'],
  [/notification|decharge/, 'notification'],
  [/titre de recette|\btitre\b/, 'titre_recette'],
  [/augmentation|revision de loyer|indexation|renouvellement|courrier|lettre|mail|courriel/, 'courrier'],
];

function typeSeditDepuisCommentaire(commentaire) {
  const c = String(commentaire || '');
  return (LIBELLE_VERS_TYPE_SEDIT.find(([re]) => re.test(c)) || [])[1] || null;
}

function classer({ nom, typeSedit, commentaire }) {
  const n = norm(nom);
  const par = typeSedit ?? typeSeditDepuisCommentaire(commentaire);
  if (par === 7) return 'rib';
  for (const [re, code] of REGLES) if (re.test(n)) return code;
  return PAR_TYPE_SEDIT[par] || 'autre';
}

module.exports = { classer, typeSeditDepuisCommentaire };
