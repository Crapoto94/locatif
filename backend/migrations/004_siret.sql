-- SIRET complet (14 chiffres) distinct du code tiers SEDIT, et résultat de la vérification auprès de l'API publique Sirene.
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siret VARCHAR(14);
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siret_statut VARCHAR(12);        -- actif | ferme | introuvable | erreur
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siret_verifie_le TIMESTAMPTZ;
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siret_fermeture_le DATE;
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS siret_denomination VARCHAR(300);
CREATE INDEX IF NOT EXISTS contractants_siret_idx ON {{schema}}.contractants(siret);
