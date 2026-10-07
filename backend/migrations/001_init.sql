-- Gestion Locative — schéma initial. {{schema}} est remplacé par PGC_SCHEMA (défaut : locatif).
-- Règle : une application = un schéma. Aucune écriture hors de ce schéma.

CREATE TABLE IF NOT EXISTS {{schema}}.settings (
  cle        VARCHAR(100) PRIMARY KEY,
  valeur     JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== Comptes, profils, permissions (ADM) =====
CREATE TABLE IF NOT EXISTS {{schema}}.users (
  id           SERIAL PRIMARY KEY,
  username     VARCHAR(120) NOT NULL UNIQUE,      -- sAMAccountName (minuscules) ou compte local
  display_name VARCHAR(200),
  email        VARCHAR(200),
  service      VARCHAR(200),
  source       VARCHAR(10) NOT NULL DEFAULT 'ad', -- 'ad' | 'local'
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.profils (
  code    VARCHAR(30) PRIMARY KEY,
  libelle VARCHAR(120) NOT NULL,
  systeme BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS {{schema}}.profil_permissions (
  profil     VARCHAR(30) NOT NULL REFERENCES {{schema}}.profils(code) ON DELETE CASCADE,
  permission VARCHAR(60) NOT NULL,
  PRIMARY KEY (profil, permission)
);

CREATE TABLE IF NOT EXISTS {{schema}}.user_profils (
  user_id INT NOT NULL REFERENCES {{schema}}.users(id) ON DELETE CASCADE,
  profil  VARCHAR(30) NOT NULL REFERENCES {{schema}}.profils(code) ON DELETE CASCADE,
  PRIMARY KEY (user_id, profil)
);

-- ===== Référentiels métier administrables (REF) =====
CREATE TABLE IF NOT EXISTS {{schema}}.ref_valeurs (
  id      SERIAL PRIMARY KEY,
  domaine VARCHAR(40) NOT NULL,
  code    VARCHAR(60) NOT NULL,
  libelle VARCHAR(200) NOT NULL,
  ordre   INT DEFAULT 0,
  actif   BOOLEAN NOT NULL DEFAULT TRUE,
  meta    JSONB DEFAULT '{}'::jsonb,
  origine VARCHAR(20) DEFAULT 'manuel',            -- 'manuel' | 'astech' | 'seed'
  UNIQUE (domaine, code)
);

-- ===== Biens (BIE) =====
CREATE TABLE IF NOT EXISTS {{schema}}.biens (
  id              SERIAL PRIMARY KEY,
  parent_id       INT REFERENCES {{schema}}.biens(id) ON DELETE SET NULL,
  niveau          VARCHAR(12) NOT NULL DEFAULT 'unite',   -- site | batiment | unite
  code            VARCHAR(80),
  designation     VARCHAR(300) NOT NULL,
  type_code       VARCHAR(60),
  categorie       VARCHAR(120),
  adresse         VARCHAR(300),
  code_postal     VARCHAR(10),
  ville           VARCHAR(120),
  surface         NUMERIC(12,2),
  reference_cadastrale VARCHAR(80),
  statut_occupation VARCHAR(60),                          -- occupation (BIE-008)
  disponibilite   VARCHAR(20) NOT NULL DEFAULT 'disponible', -- disponibilité, distincte de l'occupation
  motif_indisponibilite VARCHAR(60),
  service_code    VARCHAR(80),                            -- rattachement service / direction (BIE-005)
  direction       VARCHAR(160),
  gestionnaire    VARCHAR(160),
  hub_site_id     VARCHAR(40),                            -- lien optionnel avec les sites Hub DSI
  commentaire     TEXT,
  actif           BOOLEAN NOT NULL DEFAULT TRUE,
  astech_id       VARCHAR(40) UNIQUE,                     -- ARBO.ARB_ID (BIE-004, MIG-003)
  astech_raw      JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biens_parent_idx ON {{schema}}.biens(parent_id);
CREATE INDEX IF NOT EXISTS biens_adresse_idx ON {{schema}}.biens(lower(adresse));

CREATE TABLE IF NOT EXISTS {{schema}}.occupations_historique (
  id            SERIAL PRIMARY KEY,
  bien_id       INT NOT NULL REFERENCES {{schema}}.biens(id) ON DELETE CASCADE,
  type          VARCHAR(12) NOT NULL DEFAULT 'occupation',  -- occupation | vacance
  contrat_id    INT,
  contractant_id INT,
  date_debut    DATE,
  date_fin      DATE,
  commentaire   TEXT
);
CREATE INDEX IF NOT EXISTS occ_bien_idx ON {{schema}}.occupations_historique(bien_id);

-- ===== Contractants (CTN) =====
CREATE TABLE IF NOT EXISTS {{schema}}.contractants (
  id             SERIAL PRIMARY KEY,
  type           VARCHAR(10) NOT NULL DEFAULT 'morale',      -- physique | morale
  nom            VARCHAR(300) NOT NULL,                      -- nom ou raison sociale
  prenom         VARCHAR(120),
  forme_juridique VARCHAR(120),
  siren          VARCHAR(14),
  email          VARCHAR(200),
  telephone      VARCHAR(40),
  adresse        VARCHAR(300),
  code_postal    VARCHAR(10),
  ville          VARCHAR(120),
  tiers_sedit_id VARCHAR(40),                                -- CTN-008 : identifiant tiers financier
  commentaire    TEXT,
  actif          BOOLEAN NOT NULL DEFAULT TRUE,
  astech_nom     VARCHAR(300),                               -- libellé source ASTECH (CONTL_CONTRACTANT)
  astech_raw     JSONB,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractants_nom_idx ON {{schema}}.contractants(lower(nom));
CREATE UNIQUE INDEX IF NOT EXISTS contractants_astech_nom_uq ON {{schema}}.contractants(astech_nom) WHERE astech_nom IS NOT NULL;

CREATE TABLE IF NOT EXISTS {{schema}}.contractant_contacts (
  id             SERIAL PRIMARY KEY,
  contractant_id INT NOT NULL REFERENCES {{schema}}.contractants(id) ON DELETE CASCADE,
  nom            VARCHAR(200) NOT NULL,
  fonction       VARCHAR(160),
  email          VARCHAR(200),
  telephone      VARCHAR(40),
  signataire     BOOLEAN DEFAULT FALSE,                      -- CTN-005
  representant_legal BOOLEAN DEFAULT FALSE,                  -- CTN-006
  type_representation VARCHAR(160)
);

-- ===== Contrats (CTR) =====
CREATE TABLE IF NOT EXISTS {{schema}}.contrats (
  id              SERIAL PRIMARY KEY,
  numero          VARCHAR(80) NOT NULL,
  position        VARCHAR(10) NOT NULL DEFAULT 'bailleur',   -- bailleur | preneur (GEN-002)
  type_code       VARCHAR(60),
  statut_code     VARCHAR(60),
  objet           TEXT,
  gratuit         BOOLEAN NOT NULL DEFAULT FALSE,
  date_signature  DATE,
  date_debut      DATE,
  date_fin        DATE,
  fin_evenement   VARCHAR(300),                              -- CTR-003 : fin liée à un événement
  date_entree     DATE,
  date_sortie     DATE,
  date_debut_quittancement DATE,
  date_cloture    DATE,
  periodicite     VARCHAR(20) DEFAULT 'mensuelle',           -- mensuelle | trimestrielle (CFI-007)
  terme           VARCHAR(10) DEFAULT 'a_echoir',            -- CFI-008
  indice_type     VARCHAR(20),
  indice_reference_id INT,                                   -- indice de référence de la dernière révision / de départ
  date_revision_derniere DATE,
  date_revision_prochaine DATE,
  depot_garantie_requis BOOLEAN,
  service_code    VARCHAR(80),
  direction       VARCHAR(160),
  gestionnaire    VARCHAR(160),
  commentaire     TEXT,
  astech_id       VARCHAR(40) UNIQUE,                        -- CONTRAT.CONT_ID
  astech_raw      JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrats_numero_idx ON {{schema}}.contrats(numero);
CREATE INDEX IF NOT EXISTS contrats_statut_idx ON {{schema}}.contrats(statut_code);

CREATE TABLE IF NOT EXISTS {{schema}}.contrat_biens (
  contrat_id INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  bien_id    INT NOT NULL REFERENCES {{schema}}.biens(id) ON DELETE RESTRICT,
  PRIMARY KEY (contrat_id, bien_id)                          -- CTR-001, CTR-002 : pas de principal/complémentaire
);

CREATE TABLE IF NOT EXISTS {{schema}}.contrat_contractants (
  contrat_id     INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  contractant_id INT NOT NULL REFERENCES {{schema}}.contractants(id) ON DELETE RESTRICT,
  role_code      VARCHAR(60) NOT NULL DEFAULT 'titulaire',
  PRIMARY KEY (contrat_id, contractant_id, role_code)        -- CTN-002, CTN-003
);

CREATE TABLE IF NOT EXISTS {{schema}}.avenants (
  id          SERIAL PRIMARY KEY,
  contrat_id  INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  numero      VARCHAR(60),
  date_effet  DATE,
  objet       TEXT,
  document_id INT
);

CREATE TABLE IF NOT EXISTS {{schema}}.actes_administratifs (
  id          SERIAL PRIMARY KEY,
  contrat_id  INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  type        VARCHAR(60),                                   -- decision | deliberation | arrete | email
  reference   VARCHAR(120),
  date_acte   DATE,
  objet       TEXT,
  document_id INT
);

-- ===== Conditions financières, échéancier, charges, dépôt (CFI, ECH, CHG, DEP) =====
CREATE TABLE IF NOT EXISTS {{schema}}.conditions_financieres (
  id            SERIAL PRIMARY KEY,
  contrat_id    INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  rubrique_code VARCHAR(60) NOT NULL,                        -- loyer, redevance, charges, provision, taxe_fonciere...
  libelle       VARCHAR(200),
  montant       NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantite      NUMERIC(14,4),                               -- CFI-004 : quantité/surface × tarif × périodicité
  tarif_unitaire NUMERIC(14,4),
  date_effet    DATE,
  date_fin      DATE,
  imputation    VARCHAR(80),
  astech_id     VARCHAR(40),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cf_contrat_idx ON {{schema}}.conditions_financieres(contrat_id);

CREATE TABLE IF NOT EXISTS {{schema}}.campagnes (
  id          SERIAL PRIMARY KEY,
  periode     CHAR(7) NOT NULL UNIQUE,                       -- AAAA-MM
  statut      VARCHAR(20) NOT NULL DEFAULT 'preparation',    -- preparation | controle | correction | validee
  prepare_par VARCHAR(120),
  controle_par VARCHAR(120),
  validee_par VARCHAR(120),
  validee_le  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.echeances (
  id             SERIAL PRIMARY KEY,
  contrat_id     INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  numero         VARCHAR(40),
  libelle        VARCHAR(200),
  periode_debut  DATE NOT NULL,
  periode_fin    DATE,
  date_exigibilite DATE,                                     -- ECH-005 : distincte de la période locative
  montant_loyer  NUMERIC(14,2) NOT NULL DEFAULT 0,
  montant_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  montant_total  NUMERIC(14,2) NOT NULL DEFAULT 0,
  prorata        BOOLEAN NOT NULL DEFAULT FALSE,
  prorata_jours  INT,
  prorata_base   INT,
  statut         VARCHAR(20) NOT NULL DEFAULT 'planifiee',   -- planifiee | emise | mandatee | echue_non_emise | annulee
  numero_quittance VARCHAR(60),
  date_quittance DATE,
  date_mandatement DATE,
  campagne_id    INT REFERENCES {{schema}}.campagnes(id) ON DELETE SET NULL,
  campagne_retiree BOOLEAN NOT NULL DEFAULT FALSE,           -- CAM-007
  anomalie       TEXT,
  source         VARCHAR(20) NOT NULL DEFAULT 'app',         -- app | astech_prev | astech_hist
  astech_key     VARCHAR(80) UNIQUE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ech_contrat_idx ON {{schema}}.echeances(contrat_id);
CREATE INDEX IF NOT EXISTS ech_periode_idx ON {{schema}}.echeances(periode_debut);
CREATE INDEX IF NOT EXISTS ech_campagne_idx ON {{schema}}.echeances(campagne_id);

CREATE TABLE IF NOT EXISTS {{schema}}.campagne_journal (
  id          SERIAL PRIMARY KEY,
  campagne_id INT NOT NULL REFERENCES {{schema}}.campagnes(id) ON DELETE CASCADE,
  echeance_id INT,
  action      VARCHAR(40) NOT NULL,                          -- ajout | retrait | reprise | controle | validation
  motif       TEXT,
  utilisateur VARCHAR(120),
  ts          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.indices_valeurs (
  id          SERIAL PRIMARY KEY,
  type_code   VARCHAR(20) NOT NULL,                          -- IRL | ICC | ILC | ILAT ... (REV-001)
  annee       INT NOT NULL,
  trimestre   INT NOT NULL,
  libelle     VARCHAR(120),
  valeur      NUMERIC(12,3),
  date_publication DATE,
  astech_id   VARCHAR(40) UNIQUE,
  UNIQUE (type_code, annee, trimestre)
);

CREATE TABLE IF NOT EXISTS {{schema}}.revisions (
  id            SERIAL PRIMARY KEY,
  contrat_id    INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  date_revision DATE,
  date_application DATE,
  indice_prec_id INT REFERENCES {{schema}}.indices_valeurs(id),
  indice_nouv_id INT REFERENCES {{schema}}.indices_valeurs(id),
  pourcentage   NUMERIC(10,4),
  montant_avant NUMERIC(14,2),
  montant_apres NUMERIC(14,2),
  statut        VARCHAR(12) NOT NULL DEFAULT 'appliquee',    -- simulee | bloquee | appliquee
  motif_blocage TEXT,
  rattrapage    BOOLEAN DEFAULT FALSE,                       -- REV-009
  utilisateur   VARCHAR(120),
  astech_id     VARCHAR(40) UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rev_contrat_idx ON {{schema}}.revisions(contrat_id);

CREATE TABLE IF NOT EXISTS {{schema}}.charges (
  id          SERIAL PRIMARY KEY,
  bien_id     INT REFERENCES {{schema}}.biens(id) ON DELETE CASCADE,       -- niveau bâtiment ou bien (CHG-005/006)
  contrat_id  INT REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  annee       INT NOT NULL,
  nature      VARCHAR(12) NOT NULL DEFAULT 'reel',                         -- provision | reel
  libelle     VARCHAR(200) NOT NULL,
  montant     NUMERIC(14,2) NOT NULL DEFAULT 0,
  cle_repartition VARCHAR(20) DEFAULT 'montant_fixe',                      -- tantiemes | surface | pourcentage | montant_fixe
  valeur_cle  NUMERIC(14,4),
  total_cle   NUMERIC(14,4),
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chg_contrat_idx ON {{schema}}.charges(contrat_id, annee);

CREATE TABLE IF NOT EXISTS {{schema}}.regularisations (
  id          SERIAL PRIMARY KEY,
  contrat_id  INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  annee       INT NOT NULL,
  provisions_appelees NUMERIC(14,2) NOT NULL DEFAULT 0,
  charges_reelles     NUMERIC(14,2) NOT NULL DEFAULT 0,
  quote_part_pourcent NUMERIC(8,4),
  prorata_jours       INT,
  solde               NUMERIC(14,2) NOT NULL DEFAULT 0,             -- >0 = à payer par le contractant
  statut      VARCHAR(12) NOT NULL DEFAULT 'brouillon',            -- brouillon | validee
  detail      JSONB,
  document_id INT,
  utilisateur VARCHAR(120),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contrat_id, annee)
);

CREATE TABLE IF NOT EXISTS {{schema}}.depots_garantie (
  id            SERIAL PRIMARY KEY,
  contrat_id    INT NOT NULL REFERENCES {{schema}}.contrats(id) ON DELETE CASCADE,
  montant       NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_versement DATE,
  mode_versement VARCHAR(40),
  reference     VARCHAR(120),
  date_restitution DATE,
  montant_retenu NUMERIC(14,2) DEFAULT 0,                          -- DEP-003 : retenue partielle ou totale
  commentaire   TEXT
);

-- ===== Documents (DOC) =====
CREATE TABLE IF NOT EXISTS {{schema}}.documents (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(300) NOT NULL,
  type_code   VARCHAR(60),
  mime        VARCHAR(120),
  taille      BIGINT,
  sha256      CHAR(64),
  storage_key VARCHAR(500) NOT NULL,                               -- 'fs:...' | 'alf:<nodeId>' | 'sim:...'
  version     INT NOT NULL DEFAULT 1,
  sensible    BOOLEAN NOT NULL DEFAULT FALSE,                      -- DOC-005
  date_attendue DATE,                                              -- DOC-009 : obligations périodiques
  date_expiration DATE,
  commentaire VARCHAR(500),
  auteur      VARCHAR(120),
  astech_id   VARCHAR(40) UNIQUE,
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.document_versions (
  id          SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES {{schema}}.documents(id) ON DELETE CASCADE,
  version     INT NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  sha256      CHAR(64),
  taille      BIGINT,
  auteur      VARCHAR(120),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE TABLE IF NOT EXISTS {{schema}}.document_liens (
  document_id INT NOT NULL REFERENCES {{schema}}.documents(id) ON DELETE CASCADE,
  objet_type  VARCHAR(20) NOT NULL,                                -- bien | contrat | contractant | alerte | regularisation
  objet_id    INT NOT NULL,
  PRIMARY KEY (document_id, objet_type, objet_id)                  -- DOC-001 : un document, plusieurs objets
);
CREATE INDEX IF NOT EXISTS doclien_obj_idx ON {{schema}}.document_liens(objet_type, objet_id);

CREATE TABLE IF NOT EXISTS {{schema}}.modeles_documents (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(60) NOT NULL UNIQUE,
  libelle     VARCHAR(200) NOT NULL,
  document_id INT,                                                 -- modèle Word en GED ; NULL = modèle intégré
  actif       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Paramétrage du stockage documentaire (une seule ligne) — voir /admin/ged
CREATE TABLE IF NOT EXISTS {{schema}}.ged_config (
  id            INT PRIMARY KEY DEFAULT 1,
  mode          VARCHAR(12) NOT NULL DEFAULT 'filer',              -- filer | alfresco | simulateur
  filer_root    VARCHAR(500),
  alfresco_url  VARCHAR(300),
  alfresco_login VARCHAR(120),
  alfresco_password_enc TEXT,
  alfresco_root VARCHAR(300),
  archivage_actif BOOLEAN DEFAULT FALSE,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CHECK (id = 1)
);

-- ===== Alertes (ALT) =====
CREATE TABLE IF NOT EXISTS {{schema}}.alertes (
  id          SERIAL PRIMARY KEY,
  cle         VARCHAR(160) UNIQUE,                                 -- idempotence du calcul (type|objet|échéance)
  type        VARCHAR(30) NOT NULL,
  objet_type  VARCHAR(20),
  objet_id    INT,
  titre       VARCHAR(300) NOT NULL,
  message     TEXT,
  date_cible  DATE,
  statut      VARCHAR(10) NOT NULL DEFAULT 'active',               -- active | traitee
  assigne_a   VARCHAR(120),
  traite_par  VARCHAR(120),
  traite_le   TIMESTAMPTZ,
  traitement  TEXT,                                                -- ALT-006 : action ou commentaire
  notifie_le  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alt_statut_idx ON {{schema}}.alertes(statut);

CREATE TABLE IF NOT EXISTS {{schema}}.alertes_historique (
  id        SERIAL PRIMARY KEY,
  alerte_id INT NOT NULL REFERENCES {{schema}}.alertes(id) ON DELETE CASCADE,
  action    VARCHAR(20) NOT NULL,                                  -- reaffectation | traitement | reouverture
  de        VARCHAR(120),
  vers      VARCHAR(120),
  commentaire TEXT,
  utilisateur VARCHAR(120),
  ts        TIMESTAMPTZ DEFAULT now()
);

-- ===== Audit (AUD) =====
CREATE TABLE IF NOT EXISTS {{schema}}.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  utilisateur VARCHAR(120),
  evenement   VARCHAR(60) NOT NULL,                                -- ex. contract.updated
  entite      VARCHAR(40) NOT NULL,
  entite_id   VARCHAR(40),
  champ       VARCHAR(80),
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  motif       TEXT,
  details     JSONB
);
CREATE INDEX IF NOT EXISTS audit_entite_idx ON {{schema}}.audit_log(entite, entite_id);
CREATE INDEX IF NOT EXISTS audit_ts_idx ON {{schema}}.audit_log(ts DESC);

-- ===== Recherche enregistrée (REC-003) =====
CREATE TABLE IF NOT EXISTS {{schema}}.recherches_enregistrees (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(120) NOT NULL,
  libelle     VARCHAR(160) NOT NULL,
  requete     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===== Reprise ASTECH (MIG) =====
CREATE TABLE IF NOT EXISTS {{schema}}.reprise_runs (
  id          SERIAL PRIMARY KEY,
  debut       TIMESTAMPTZ DEFAULT now(),
  fin         TIMESTAMPTZ,
  statut      VARCHAR(12) NOT NULL DEFAULT 'en_cours',             -- en_cours | termine | erreur
  environnement VARCHAR(10),
  options     JSONB,
  stats       JSONB,
  erreur      TEXT,
  utilisateur VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS {{schema}}.reprise_anomalies (
  id        SERIAL PRIMARY KEY,
  run_id    INT NOT NULL REFERENCES {{schema}}.reprise_runs(id) ON DELETE CASCADE,
  niveau    VARCHAR(10) NOT NULL DEFAULT 'warning',
  objet     VARCHAR(40),
  reference VARCHAR(80),
  message   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{schema}}.reprise_doublons (
  id        SERIAL PRIMARY KEY,
  entite    VARCHAR(20) NOT NULL,                                  -- contractant | bien
  id_a      INT NOT NULL,
  id_b      INT NOT NULL,
  motif     VARCHAR(200),
  statut    VARCHAR(20) NOT NULL DEFAULT 'a_examiner',             -- a_examiner | distincts | a_fusionner_manuellement
  examine_par VARCHAR(120),
  examine_le  TIMESTAMPTZ,
  UNIQUE (entite, id_a, id_b)
);
