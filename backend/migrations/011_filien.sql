-- FILIEN (interface SEDIT GF « Finances amont ») : imputations par rubrique, historique des exports et suivi de la facturation.
-- Le paramétrage général (organisme, budget, compteurs, dossier de dépôt…) vit dans settings (clé « filien »).

-- Ventilation budgétaire (balises /541/ et /542/) par rubrique d'échéance (loyer | charges) et, au besoin, par type de contrat.
CREATE TABLE IF NOT EXISTS {{schema}}.filien_imputations (
  id             SERIAL PRIMARY KEY,
  rubrique       VARCHAR(20) NOT NULL,                     -- loyer | charges
  type_contrat   VARCHAR(60),                              -- NULL = tous les types ; sinon plus spécifique que la ligne générale
  libelle        VARCHAR(80),                              -- libellé de la ligne (/57/) et du détail de prestation (/502/)
  chapitre       VARCHAR(10) NOT NULL DEFAULT '',
  nature         VARCHAR(10) NOT NULL DEFAULT '',
  fonction       VARCHAR(10) NOT NULL DEFAULT '',
  code_interne   VARCHAR(10) NOT NULL DEFAULT '',
  type_mouvement VARCHAR(1)  NOT NULL DEFAULT 'R',         -- R réel | E ordre de transfert | I ordre dans la section
  sens           VARCHAR(1)  NOT NULL DEFAULT 'R',         -- R recette | D dépense
  structure      VARCHAR(10) NOT NULL DEFAULT '',
  gestionnaire   VARCHAR(10) NOT NULL DEFAULT '',
  destinataire   VARCHAR(10) NOT NULL DEFAULT '',
  actif          BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS filien_imputations_uq ON {{schema}}.filien_imputations(rubrique, COALESCE(type_contrat, ''));

-- Un export = un fichier .filien.txt + ses pièces jointes, déposés dans un dossier, pour une campagne.
CREATE TABLE IF NOT EXISTS {{schema}}.filien_exports (
  id             SERIAL PRIMARY KEY,
  campagne_id    INT NOT NULL REFERENCES {{schema}}.campagnes(id) ON DELETE CASCADE,
  periode        CHAR(7) NOT NULL,
  nom            VARCHAR(120) NOT NULL,                    -- nom du sous-dossier et du fichier (sans extension)
  dossier        TEXT NOT NULL,                            -- dossier réellement écrit par l'application
  fichier        VARCHAR(160) NOT NULL,                    -- <nom>.filien.txt
  nb_mouvements  INT NOT NULL,
  nb_pj          INT NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  premier_mouvement VARCHAR(20),
  dernier_mouvement VARCHAR(20),
  exercice       INT,
  contenu        TEXT NOT NULL,                            -- copie du fichier (téléchargeable même si le dossier est déplacé)
  statut         VARCHAR(10) NOT NULL DEFAULT 'genere',    -- genere | annule
  genere_par     VARCHAR(120),
  genere_le      TIMESTAMPTZ DEFAULT now(),
  annule_par     VARCHAR(120),
  annule_le      TIMESTAMPTZ,
  annule_motif   TEXT
);
CREATE INDEX IF NOT EXISTS filien_exports_campagne_idx ON {{schema}}.filien_exports(campagne_id);

-- Facturation réalisée = échéances « émises » dans un export ; statut_avant permet d'annuler proprement un export.
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS filien_export_id INT REFERENCES {{schema}}.filien_exports(id) ON DELETE SET NULL;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS filien_mouvement VARCHAR(20);     -- balise /01/
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS filien_titre_interne VARCHAR(10); -- balise /13/
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS filien_statut_avant VARCHAR(20);
CREATE INDEX IF NOT EXISTS ech_filien_idx ON {{schema}}.echeances(filien_export_id);

ALTER TABLE {{schema}}.campagnes ADD COLUMN IF NOT EXISTS facturee_le TIMESTAMPTZ;
ALTER TABLE {{schema}}.campagnes ADD COLUMN IF NOT EXISTS facturee_par VARCHAR(120);
ALTER TABLE {{schema}}.campagnes ADD COLUMN IF NOT EXISTS filien_export_id INT;

-- Nouveaux droits : attribués aux profils existants (les profils créés plus tard reçoivent le catalogue du code).
INSERT INTO {{schema}}.profil_permissions(profil, permission)
SELECT p.code, x.perm FROM {{schema}}.profils p
JOIN (VALUES ('ADMIN_GL','filien.read'),('ADMIN_GL','filien.generer'),('ADMIN_GL','admin.filien'),
             ('AFLC','filien.read'),('AFLC','filien.generer'),
             ('DSF','filien.read'),('DSI','filien.read'),('LECTURE','filien.read')) AS x(profil, perm) ON x.profil = p.code
ON CONFLICT DO NOTHING;
