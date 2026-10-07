-- Candidats SEDIT d'un rapprochement ambigu : liste [{code, roo, nom, siret}] présentée à l'utilisateur pour trancher.
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS tiers_sedit_candidats JSONB;
