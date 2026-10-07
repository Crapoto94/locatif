-- Position des biens sur la carte (WGS84). Source : Base Adresse Nationale (géocodage de l'adresse) ou saisie manuelle.
ALTER TABLE {{schema}}.biens ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7);
ALTER TABLE {{schema}}.biens ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE {{schema}}.biens ADD COLUMN IF NOT EXISTS geoloc_source VARCHAR(10);      -- ban | manuel
ALTER TABLE {{schema}}.biens ADD COLUMN IF NOT EXISTS geoloc_score  NUMERIC(4,3);     -- fiabilité renvoyée par le géocodeur (0 à 1)
ALTER TABLE {{schema}}.biens ADD COLUMN IF NOT EXISTS geoloc_label  VARCHAR(300);     -- adresse reconnue par le géocodeur
