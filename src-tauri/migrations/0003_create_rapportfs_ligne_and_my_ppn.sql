-- Materialized subset of produit_programme_niveau relevant to the FS saved in
-- my_organisation_unit (via organisation_unit_group_member). Refreshed by the
-- app whenever the config is re-imported or the saved organisation unit
-- changes, so the report-view page can loop over it directly without joining
-- through the FS's group memberships on every page load.
CREATE TABLE IF NOT EXISTS my_produitprogrammeniveau
(
    id             TEXT PRIMARY KEY NOT NULL,
    produit_id     INTEGER          NOT NULL REFERENCES produit (id),
    programme_id   TEXT             NOT NULL REFERENCES programme (id),
    org_group_id   TEXT             NOT NULL,
    org_group_name TEXT             NOT NULL,
    "order"        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_my_ppn_programme ON my_produitprogrammeniveau (programme_id);

-- Per-produit line items for a rapportfs, one row per produit_programme_niveau
-- (RapportFsLigne in rapport-model.ts).
CREATE TABLE IF NOT EXISTS rapportfs_ligne
(
    id                          TEXT PRIMARY KEY NOT NULL,
    rapportfs_id                TEXT             NOT NULL REFERENCES rapportfs (id) ON DELETE CASCADE,
    produit_programme_niveau_id TEXT             NOT NULL REFERENCES produit_programme_niveau (id),
    qte_dispo_deb_mois          INTEGER,
    qte_rec_mois                INTEGER,
    qte_dist_patient            INTEGER,
    qte_dist_ac                 INTEGER,
    qte_perime_avarie_mois      INTEGER,
    qte_redepl_mois             INTEGER,
    nb_jour_rupture             INTEGER,
    stock_theorique             INTEGER,
    sdu_fin_mois                INTEGER,
    ecart                       INTEGER,
    cmm                         REAL,
    msd                         REAL             NOT NULL DEFAULT 0,
    situation                   TEXT             NOT NULL DEFAULT '',
    observation                 TEXT             NOT NULL DEFAULT '',
    UNIQUE (rapportfs_id, produit_programme_niveau_id)
);

CREATE INDEX IF NOT EXISTS idx_rapportfs_ligne_rapportfs ON rapportfs_ligne (rapportfs_id);

-- DetailSDU[] nested under a RapportFsLigne.
CREATE TABLE IF NOT EXISTS detail_sdu
(
    id                 TEXT PRIMARY KEY NOT NULL,
    rapportfs_ligne_id TEXT             NOT NULL REFERENCES rapportfs_ligne (id) ON DELETE CASCADE,
    sdu                INTEGER          NOT NULL,
    date_peremption    TEXT
);

CREATE INDEX IF NOT EXISTS idx_detail_sdu_ligne ON detail_sdu (rapportfs_ligne_id);
