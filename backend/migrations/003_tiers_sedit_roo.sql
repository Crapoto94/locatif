-- Identifiant technique SEDIT du tiers (FI.TIERS.ROO_IMA_REF) : nécessaire pour ouvrir la fiche dans SEDIT.
ALTER TABLE {{schema}}.contractants ADD COLUMN IF NOT EXISTS tiers_sedit_roo VARCHAR(40);
