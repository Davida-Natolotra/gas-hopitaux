-- Mirrors the Django `Rapportfs` model (rapportfs/models.py), minus the
-- `rapport` foreign key which is not relevant to this application.
CREATE TABLE IF NOT EXISTS rapportfs
(
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT             NOT NULL,
    created       TEXT             NOT NULL,
    exported_date TEXT,
    status        INTEGER          NOT NULL DEFAULT 0,
    mois_annee    TEXT,
    fs_id         TEXT             NOT NULL,
    edited_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_rapportfs_fs_id ON rapportfs (fs_id);
