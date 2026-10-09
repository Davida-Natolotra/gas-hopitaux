-- Report names now carry the hospital's name: createRapportFs() names a new report
-- "Rapport <FS> - MM/YYYY" instead of the generic "Rapport Hopitaux MM/YYYY". Rename
-- the reports created before that change the same way, so the list reads
-- consistently.
--
-- Only a name still exactly in the old default form for its own month is touched,
-- and only when the report's FS is in organisation_units; otherwise the name stays.
-- MM/YYYY is rebuilt from mois_annee ("YYYY-MM" or legacy "YYYY-MM-DD"), as
-- formatMoisAnnee() renders it.
UPDATE rapportfs
SET name = 'Rapport ' || (SELECT ou.name FROM organisation_units ou WHERE ou.id = rapportfs.fs_id)
               || ' - '
               || CASE
                      WHEN mois_annee IS NULL THEN '-'
                      ELSE substr(mois_annee, 6, 2) || '/' || substr(mois_annee, 1, 4)
                  END
WHERE name = 'Rapport Hopitaux '
                 || CASE
                        WHEN mois_annee IS NULL THEN '-'
                        ELSE substr(mois_annee, 6, 2) || '/' || substr(mois_annee, 1, 4)
                    END
  AND EXISTS (SELECT 1 FROM organisation_units ou WHERE ou.id = rapportfs.fs_id);
