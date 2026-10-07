// Données initiales : profils, permissions, référentiels (valeurs déduites d'ASTECH / du manifeste),
// modèles intégrés et compte administrateur local. Idempotent : ne réécrase jamais une saisie utilisateur.
const { db, t } = require('../db');
const { config } = require('../config');
const { PROFILS } = require('./permissions');

const REF = {
  type_bien: [['logement', 'Logement'], ['maison', 'Maison'], ['parking', 'Parking'], ['garage', 'Garage'], ['cave', 'Cave'],
    ['bureau', 'Bureau'], ['local_commercial', 'Local commercial'], ['local_associatif', 'Local associatif'],
    ['terrain', 'Terrain'], ['entrepot', 'Entrepôt'], ['autre', 'Autre']],
  statut_occupation: [['occupe', 'Occupé'], ['vacant', 'Vacant']],
  disponibilite: [['disponible', 'Disponible'], ['indisponible', 'Indisponible']],
  motif_indisponibilite: [['travaux', 'Travaux'], ['vente', 'Cession en cours'], ['reserve', 'Réservé collectivité'],
    ['insalubrite', 'Insalubrité'], ['autre', 'Autre']],
  type_contrat: [['bail_habitation_89', "Bail d'habitation (loi 89)"], ['bail_commercial', 'Bail commercial'],
    ['bail_professionnel', 'Bail professionnel'], ['bail_derogatoire', 'Bail dérogatoire'],
    ['convention_occupation', "Convention d'occupation"], ['mise_a_disposition', 'Mise à disposition'],
    ['location_preneur', 'Location (collectivité preneuse)'], ['autre', 'Autre']],
  statut_contrat: [['en_cours', 'En cours'], ['clos', 'Clos'], ['divers', 'Divers (à qualifier)'], ['resilie', 'Résilié']],
  role_contractant: [['titulaire', 'Titulaire'], ['cotitulaire', 'Cotitulaire'], ['representant_legal', 'Représentant légal'],
    ['signataire', 'Signataire'], ['interlocuteur', 'Interlocuteur'], ['garant', 'Garant']],
  rubrique: [['loyer', 'Loyer'], ['redevance', 'Redevance'], ['charges', 'Charges'], ['provision_charges', 'Provisions sur charges'],
    ['regularisation', 'Régularisation'], ['indemnite_occupation', "Indemnité d'occupation"], ['taxe_fonciere', 'Taxe foncière'],
    ['depot_garantie', 'Dépôt de garantie'], ['restitution_garantie', 'Restitution de garantie']],
  type_document: [['contrat', 'Contrat'], ['decision_municipale', 'Décision municipale'], ['deliberation', 'Délibération'],
    ['kbis', 'Kbis'], ['statuts', "Statuts d'association"], ['siren', 'Numéro SIREN'], ['notification', 'Notification / décharge'],
    ['attestation_assurance', "Attestation d'assurance"], ['arrete', 'Arrêté'], ['avenant', 'Avenant'], ['quittance', 'Quittance'],
    ['courrier', 'Courrier'], ['certificat_administratif', 'Certificat administratif (DSF)'], ['modele_word', 'Modèle Word'],
    ['convention_occupation', "Convention / autorisation d'occupation (AOT, COP…)"], ['titre_recette', 'Titre de recette'], ['piece_justificative', 'Autre pièce justificative du tiers'],
    ['piece_identite', "Pièce d'identité", { sensible: true }], ['rib', 'RIB', { sensible: true }], ['autre', 'Autre']],
  type_indice: [['IRL', 'IRL', { astech_typ: 1 }], ['ICC', 'ICC', { astech_typ: 2 }], ['ILC', 'ILC', { astech_typ: 5 }], ['ILAT', 'ILAT', { astech_typ: 6 }]],
};

async function seedProfils() {
  for (const p of PROFILS) {
    await db.run(`INSERT INTO ${t('profils')}(code, libelle, systeme) VALUES ($1,$2,TRUE) ON CONFLICT (code) DO NOTHING`, [p.code, p.libelle]);
    // Les permissions ne sont posées qu'à la création du profil : la matrice reste modifiable à l'écran.
    const n = await db.get(`SELECT count(*)::int AS n FROM ${t('profil_permissions')} WHERE profil = $1`, [p.code]);
    if (!n.n) for (const perm of p.permissions) {
      await db.run(`INSERT INTO ${t('profil_permissions')}(profil, permission) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [p.code, perm]);
    }
  }
}

async function seedReferentiels() {
  for (const [domaine, vals] of Object.entries(REF)) {
    let ordre = 0;
    for (const [code, libelle, meta] of vals) {
      ordre += 10;
      await db.run(
        `INSERT INTO ${t('ref_valeurs')}(domaine, code, libelle, ordre, meta, origine) VALUES ($1,$2,$3,$4,$5,'seed')
         ON CONFLICT (domaine, code) DO NOTHING`, [domaine, code, libelle, ordre, JSON.stringify(meta || {})]);
    }
  }
}

async function seedModeles() {
  const defs = [['revision_loyer', 'Augmentation de loyer (revue des indices)'], ['regularisation_charges', 'Régularisation des charges']];
  for (const [code, libelle] of defs) {
    await db.run(`INSERT INTO ${t('modeles_documents')}(code, libelle) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING`, [code, libelle]);
  }
}

async function seedLocalAdmin() {
  const la = config.localAdmin;
  if (!la.enabled) return;
  const u = await db.get(
    `INSERT INTO ${t('users')}(username, display_name, source) VALUES ($1,'Administrateur local','local')
     ON CONFLICT (username) DO UPDATE SET updated_at = now() RETURNING id`, [la.username]);
  await db.run(`INSERT INTO ${t('user_profils')}(user_id, profil) VALUES ($1,'ADMIN_GL') ON CONFLICT DO NOTHING`, [u.id]);
}

async function seedAll() {
  await seedProfils();
  await seedReferentiels();
  await seedModeles();
  await seedLocalAdmin();
}

module.exports = { seedAll, REF };
