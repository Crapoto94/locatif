-- Tiers ASTECH (FOURNISSEUR.SFOU_COD) des contractants : base du rapprochement avec les tiers SEDIT.
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS astech_tiers_cod VARCHAR(40);
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS tiers_sedit_statut VARCHAR(20);  -- rapproche | ambigu | introuvable | manuel
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS tiers_sedit_note TEXT;
CREATE INDEX IF NOT EXISTS contractants_astech_tiers_idx ON {{schema}}.contractants(astech_tiers_cod);
