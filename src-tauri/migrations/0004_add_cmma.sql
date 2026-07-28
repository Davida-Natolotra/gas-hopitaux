-- CMMA (Consommation Moyenne Mensuelle Ajustée) alongside CMM in RapportFsLigne.
ALTER TABLE rapportfs_ligne
    ADD COLUMN cmma REAL;
