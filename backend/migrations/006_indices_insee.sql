-- Rapprochement des indices avec la base INSEE (BDM) : valeur officielle, statut et date de vérification.
ALTER TABLE {{schema}}.indices_valeurs ADD COLUMN IF NOT EXISTS valeur_insee NUMERIC(12,3);
ALTER TABLE {{schema}}.indices_valeurs ADD COLUMN IF NOT EXISTS statut_insee VARCHAR(12);   -- conforme | ecart | ajoute | absent
ALTER TABLE {{schema}}.indices_valeurs ADD COLUMN IF NOT EXISTS verifie_le TIMESTAMPTZ;
ALTER TABLE {{schema}}.indices_valeurs ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'manuel';  -- manuel | astech | insee
UPDATE {{schema}}.indices_valeurs SET source = 'astech' WHERE astech_id IS NOT NULL AND source = 'manuel';
CREATE INDEX IF NOT EXISTS indices_date_idx ON {{schema}}.indices_valeurs(annee DESC, trimestre DESC);
