-- Reference data imported from the server's utgl_config.json export, mirroring
-- the equivalent tables in the utgl-csb Tauri app.

CREATE TABLE IF NOT EXISTS organisation_units
(
    id        TEXT PRIMARY KEY NOT NULL,
    name      TEXT             NOT NULL,
    level     INTEGER          NOT NULL,
    parent_id TEXT REFERENCES organisation_units (id)
);

CREATE INDEX IF NOT EXISTS idx_ou_level ON organisation_units (level);
CREATE INDEX IF NOT EXISTS idx_ou_parent ON organisation_units (parent_id);
CREATE INDEX IF NOT EXISTS idx_ou_name ON organisation_units (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS organisation_unit_group
(
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT             NOT NULL,
    short_name TEXT             NOT NULL
);

CREATE TABLE IF NOT EXISTS organisation_unit_group_member
(
    group_id TEXT NOT NULL REFERENCES organisation_unit_group (id),
    ou_id    TEXT NOT NULL REFERENCES organisation_units (id),
    PRIMARY KEY (group_id, ou_id)
);

CREATE TABLE IF NOT EXISTS programme
(
    id   TEXT PRIMARY KEY NOT NULL,
    name TEXT             NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS produit
(
    id         INTEGER PRIMARY KEY NOT NULL,
    name       TEXT                NOT NULL,
    unit       TEXT                NOT NULL,
    code       TEXT,
    uuid_dhis2 TEXT
);

CREATE INDEX IF NOT EXISTS idx_produit_name ON produit (name);

CREATE TABLE IF NOT EXISTS produit_programme_niveau
(
    id             TEXT PRIMARY KEY NOT NULL,
    produit_id     INTEGER          NOT NULL REFERENCES produit (id),
    programme_id   TEXT             NOT NULL REFERENCES programme (id),
    org_group_id   TEXT             NOT NULL,
    org_group_name TEXT             NOT NULL,
    "order"        INTEGER,
    UNIQUE (produit_id, programme_id, org_group_id)
);

CREATE INDEX IF NOT EXISTS idx_ppn_programme ON produit_programme_niveau (programme_id);
CREATE INDEX IF NOT EXISTS idx_ppn_org_group ON produit_programme_niveau (org_group_name);

-- Singleton row: the device's saved organisation unit (DRSP/region > SDSP/district
-- > commune (optional) > FS). Single FS only — unlike utgl-csb's multi-FS list —
-- since this app produces one report per formation sanitaire.
CREATE TABLE IF NOT EXISTS my_organisation_unit
(
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    drsp_id    TEXT NOT NULL REFERENCES organisation_units (id),
    sdsp_id    TEXT NOT NULL REFERENCES organisation_units (id),
    commune_id TEXT REFERENCES organisation_units (id),
    fs_id      TEXT NOT NULL REFERENCES organisation_units (id)
);
