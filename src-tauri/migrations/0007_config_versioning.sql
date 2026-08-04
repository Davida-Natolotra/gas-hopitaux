-- Configuration versioning, produit UUIDs, and per-line produit labels.
--
-- The gas-fs equivalent is migration 0008; this one is identical except that
-- rapportfs_ligne has no qte_dist_ac (hospitals only distribute to patients,
-- and migration 0006 dropped the column).
--
-- Three changes that have to land together:
--
-- 1. `produit.id` becomes TEXT. The server now identifies a produit by UUID
--    instead of a sequence number, because a sequence number is only unique
--    within one database and re-seeding silently re-pointed every device's
--    configuration at a different produit. SQLite cannot ALTER a column's type,
--    so the affected tables are rebuilt below. `produit_programme_niveau.id` is
--    unchanged — it was already a UUID — which is what lets existing reports
--    survive: rapportfs_ligne resolves against the PPN, never against produit.
--
-- 2. Reference data gains `active` / `archived_at`. A produit withdrawn from the
--    configuration is archived rather than dropped, so a report captured while
--    it was still collected keeps showing it. The app offers only active rows
--    for the current month, and shows archived ones for past months.
--
-- 3. Each report records the configuration version it was filled in against,
--    and each line records how its produit was labelled at the time. Without the
--    version there is no way to tell a report that is genuinely missing a
--    produit from one captured before that produit existed; without the labels a
--    later rename would silently rewrite what the report appears to say.
--
-- The rebuild drops and recreates five tables in child-to-parent order so that
-- foreign keys are never violated mid-flight. sqlx runs this whole file in one
-- transaction, and `PRAGMA foreign_keys` cannot be changed inside a
-- transaction, so the ordering is doing the work that pragma normally would.
-- Data is staged in `mig_*` tables (CREATE TABLE AS carries no constraints)
-- and copied back afterwards.

-- ── Which configuration this device holds ────────────────────────────────────
-- Singleton, like my_organisation_unit. `version` is the server's
-- ConfigurationVersion.id: forward-only, so a higher number is always a later
-- configuration. `schema` guards the file's shape, separately from its contents.
CREATE TABLE IF NOT EXISTS config_version
(
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    version      INTEGER NOT NULL,
    schema       INTEGER NOT NULL,
    published_at TEXT,
    checksum     TEXT,
    imported_at  TEXT    NOT NULL
);

-- ── Stage the data ───────────────────────────────────────────────────────────
CREATE TABLE mig_produit AS
SELECT CAST(id AS TEXT) AS id, name, unit, code, uuid_dhis2
FROM produit;

CREATE TABLE mig_ppn AS
SELECT id, CAST(produit_id AS TEXT) AS produit_id, programme_id, org_group_id, org_group_name, "order"
FROM produit_programme_niveau;

CREATE TABLE mig_my_ppn AS
SELECT id, CAST(produit_id AS TEXT) AS produit_id, programme_id, org_group_id, org_group_name, "order"
FROM my_produitprogrammeniveau;

-- The produit labels are read off the current join *before* the tables move,
-- so lines captured before this migration keep displaying what they were
-- collected against.
CREATE TABLE mig_ligne AS
SELECT l.id,
       l.rapportfs_id,
       l.produit_programme_niveau_id,
       l.qte_dispo_deb_mois,
       l.qte_rec_mois,
       l.qte_dist_patient,
       l.qte_perime_avarie_mois,
       l.qte_redepl_mois,
       l.nb_jour_rupture,
       l.stock_theorique,
       l.sdu_fin_mois,
       l.ecart,
       l.cmm,
       l.cmma,
       l.msd,
       l.situation,
       l.observation,
       COALESCE(p.code, '') AS produit_code,
       COALESCE(p.name, '') AS produit_name,
       COALESCE(p.unit, '') AS produit_unit,
       COALESCE(pr.name, '') AS programme_name
FROM rapportfs_ligne l
         LEFT JOIN produit_programme_niveau ppn ON ppn.id = l.produit_programme_niveau_id
         LEFT JOIN produit p ON p.id = ppn.produit_id
         LEFT JOIN programme pr ON pr.id = ppn.programme_id;

CREATE TABLE mig_detail_sdu AS
SELECT id, rapportfs_ligne_id, sdu, date_peremption
FROM detail_sdu;

-- ── Drop, child first ────────────────────────────────────────────────────────
DROP TABLE detail_sdu;
DROP TABLE rapportfs_ligne;
DROP TABLE my_produitprogrammeniveau;
DROP TABLE produit_programme_niveau;
DROP TABLE produit;

-- ── Recreate ─────────────────────────────────────────────────────────────────
CREATE TABLE produit
(
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT             NOT NULL,
    unit        TEXT             NOT NULL,
    code        TEXT,
    uuid_dhis2  TEXT,
    active      INTEGER          NOT NULL DEFAULT 1,
    archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_produit_name ON produit (name);

CREATE TABLE produit_programme_niveau
(
    id             TEXT PRIMARY KEY NOT NULL,
    produit_id     TEXT             NOT NULL REFERENCES produit (id),
    programme_id   TEXT             NOT NULL REFERENCES programme (id),
    org_group_id   TEXT             NOT NULL,
    org_group_name TEXT             NOT NULL,
    "order"        INTEGER,
    active         INTEGER          NOT NULL DEFAULT 1,
    archived_at    TEXT,
    UNIQUE (produit_id, programme_id, org_group_id)
);

CREATE INDEX IF NOT EXISTS idx_ppn_programme ON produit_programme_niveau (programme_id);
CREATE INDEX IF NOT EXISTS idx_ppn_org_group ON produit_programme_niveau (org_group_name);
CREATE INDEX IF NOT EXISTS idx_ppn_active ON produit_programme_niveau (active);

CREATE TABLE my_produitprogrammeniveau
(
    id             TEXT PRIMARY KEY NOT NULL,
    produit_id     TEXT             NOT NULL REFERENCES produit (id),
    programme_id   TEXT             NOT NULL REFERENCES programme (id),
    org_group_id   TEXT             NOT NULL,
    org_group_name TEXT             NOT NULL,
    "order"        INTEGER,
    active         INTEGER          NOT NULL DEFAULT 1,
    archived_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_my_ppn_programme ON my_produitprogrammeniveau (programme_id);
CREATE INDEX IF NOT EXISTS idx_my_ppn_active ON my_produitprogrammeniveau (active);

CREATE TABLE rapportfs_ligne
(
    id                          TEXT PRIMARY KEY NOT NULL,
    rapportfs_id                TEXT             NOT NULL REFERENCES rapportfs (id) ON DELETE CASCADE,
    produit_programme_niveau_id TEXT             NOT NULL REFERENCES produit_programme_niveau (id),
    qte_dispo_deb_mois          INTEGER,
    qte_rec_mois                INTEGER,
    qte_dist_patient            INTEGER,
    qte_perime_avarie_mois      INTEGER,
    qte_redepl_mois             INTEGER,
    nb_jour_rupture             INTEGER,
    stock_theorique             INTEGER,
    sdu_fin_mois                INTEGER,
    ecart                       INTEGER,
    cmm                         REAL,
    cmma                        REAL,
    msd                         REAL             NOT NULL DEFAULT 0,
    situation                   TEXT             NOT NULL DEFAULT '',
    observation                 TEXT             NOT NULL DEFAULT '',
    -- How the produit was labelled when this line was filled in. The line is
    -- displayed from these, not from the join, so a later rename or archival
    -- cannot rewrite a report that has already been captured.
    produit_code                TEXT             NOT NULL DEFAULT '',
    produit_name                TEXT             NOT NULL DEFAULT '',
    produit_unit                TEXT             NOT NULL DEFAULT '',
    programme_name              TEXT             NOT NULL DEFAULT '',
    UNIQUE (rapportfs_id, produit_programme_niveau_id)
);

CREATE INDEX IF NOT EXISTS idx_rapportfs_ligne_rapportfs ON rapportfs_ligne (rapportfs_id);

CREATE TABLE detail_sdu
(
    id                 TEXT PRIMARY KEY NOT NULL,
    rapportfs_ligne_id TEXT             NOT NULL REFERENCES rapportfs_ligne (id) ON DELETE CASCADE,
    sdu                INTEGER          NOT NULL,
    date_peremption    TEXT
);

CREATE INDEX IF NOT EXISTS idx_detail_sdu_ligne ON detail_sdu (rapportfs_ligne_id);

-- ── Restore, parent first ────────────────────────────────────────────────────
INSERT INTO produit (id, name, unit, code, uuid_dhis2)
SELECT id, name, unit, code, uuid_dhis2
FROM mig_produit;

INSERT INTO produit_programme_niveau (id, produit_id, programme_id, org_group_id, org_group_name, "order")
SELECT id, produit_id, programme_id, org_group_id, org_group_name, "order"
FROM mig_ppn;

INSERT INTO my_produitprogrammeniveau (id, produit_id, programme_id, org_group_id, org_group_name, "order")
SELECT id, produit_id, programme_id, org_group_id, org_group_name, "order"
FROM mig_my_ppn;

INSERT INTO rapportfs_ligne (id, rapportfs_id, produit_programme_niveau_id, qte_dispo_deb_mois, qte_rec_mois,
                             qte_dist_patient, qte_perime_avarie_mois, qte_redepl_mois, nb_jour_rupture,
                             stock_theorique, sdu_fin_mois, ecart, cmm, cmma, msd, situation, observation,
                             produit_code, produit_name, produit_unit, programme_name)
SELECT id,
       rapportfs_id,
       produit_programme_niveau_id,
       qte_dispo_deb_mois,
       qte_rec_mois,
       qte_dist_patient,
       qte_perime_avarie_mois,
       qte_redepl_mois,
       nb_jour_rupture,
       stock_theorique,
       sdu_fin_mois,
       ecart,
       cmm,
       cmma,
       COALESCE(msd, 0),
       COALESCE(situation, ''),
       COALESCE(observation, ''),
       produit_code,
       produit_name,
       produit_unit,
       programme_name
FROM mig_ligne;

INSERT INTO detail_sdu (id, rapportfs_ligne_id, sdu, date_peremption)
SELECT id, rapportfs_ligne_id, sdu, date_peremption
FROM mig_detail_sdu;

DROP TABLE mig_detail_sdu;
DROP TABLE mig_ligne;
DROP TABLE mig_my_ppn;
DROP TABLE mig_ppn;
DROP TABLE mig_produit;

-- ── Archival state on the remaining reference tables ─────────────────────────
ALTER TABLE programme
    ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE programme
    ADD COLUMN archived_at TEXT;

ALTER TABLE organisation_unit_group
    ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organisation_unit_group
    ADD COLUMN archived_at TEXT;

-- ── The configuration a report was captured against ──────────────────────────
ALTER TABLE rapportfs
    ADD COLUMN config_version INTEGER;
