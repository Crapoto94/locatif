-- Numéro de mandat SEDIT d'une échéance mandatée (ASTECH ne conserve que les dates : CONTEC_NUMMAN est vide).
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_numero INT;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_exercice INT;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_date DATE;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_bordereau INT;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_roo VARCHAR(40);            -- identifiant technique SEDIT : sert au lien vers la fiche mandat
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_confiance VARCHAR(10);      -- exact | probable
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS mandat_verifie_le TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ech_mandat_idx ON {{schema}}.echeances(mandat_exercice, mandat_numero);
