-- The "quantité distribuée à l'AC" field is no longer collected: it is gone
-- from the edit form, the completeness check and the CMM computation (which
-- now averages qte_dist_patient alone).
ALTER TABLE rapportfs_ligne
    DROP COLUMN qte_dist_ac;
