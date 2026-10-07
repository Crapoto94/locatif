-- État de l'unité légale (SIREN) en plus de celui de l'établissement (SIRET) : fermeture d'un établissement ou cessation de l'entreprise ?
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siren_etat VARCHAR(10);              -- active | cessee
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siren_cessation_le DATE;
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS etablissements_ouverts INT;
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siege_siret VARCHAR(14);
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siege_adresse VARCHAR(300);
