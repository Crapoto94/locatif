-- Vocabulaire : une échéance de loyer est une RECETTE, donc « titrée » (titre de recette) et non « mandatée » (mandat = dépense).
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema = '{{schema}}' AND table_name = 'echeances' AND column_name LIKE 'mandat\_%' LOOP
    EXECUTE format('ALTER TABLE {{schema}}.echeances RENAME COLUMN %I TO %I', c, 'titre_' || substr(c, 8));
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '{{schema}}' AND table_name = 'echeances' AND column_name = 'date_mandatement') THEN
    EXECUTE 'ALTER TABLE {{schema}}.echeances RENAME COLUMN date_mandatement TO date_titrage';
  END IF;
END $$;
UPDATE {{schema}}.echeances SET statut = 'titree' WHERE statut = 'mandatee';
ALTER INDEX IF EXISTS {{schema}}.ech_mandat_idx RENAME TO ech_titre_idx;

-- Suivi du paiement du titre (lu dans SEDIT : date de prise en charge par le comptable, date de paiement, rejet, suspension).
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS titre_prise_en_charge_le DATE;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS titre_paiement_le DATE;
ALTER TABLE {{schema}}.echeances ADD COLUMN IF NOT EXISTS titre_etat VARCHAR(20);   -- paye | a_payer | non_pris_en_charge | rejete | suspendu
