-- Produits configured per facility type and category (configuration schema 4).
--
-- The server used to configure a produit once per organisation unit group, and
-- this device offered an FS every row of every group it belonged to — so a CSB
-- that was also a CTTR listed the produits both groups share twice. Now each
-- produit_programme_niveau belongs to one facility type (CSB, HOPITAUX) and may
-- name categories (CTTR, CR, CDT, …): an FS owes it when it is a member of the
-- facility type and, if the row names categories, of at least one of them.
-- See features/configuration/services/applicability.ts.
--
-- produit_programme_niveau keeps its org_group_id / org_group_name columns:
-- they are NOT NULL, and org_group_id sits in a UNIQUE constraint that SQLite
-- can only drop by rebuilding the table and everything referencing it. A
-- schema 4 import fills org_group_name with the facility type's name — what
-- every screen shows as the niveau — and org_group_id with the row's own id,
-- so that constraint can never refuse a row the server considers distinct.
-- facility_type_id is what decides applicability.

CREATE TABLE IF NOT EXISTS facility_type
(
    id   TEXT PRIMARY KEY NOT NULL,
    name TEXT             NOT NULL
);

CREATE TABLE IF NOT EXISTS facility_type_member
(
    facility_type_id TEXT NOT NULL REFERENCES facility_type (id),
    ou_id            TEXT NOT NULL REFERENCES organisation_units (id),
    PRIMARY KEY (facility_type_id, ou_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_type_member_ou ON facility_type_member (ou_id);

CREATE TABLE IF NOT EXISTS category
(
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT             NOT NULL,
    programme_id TEXT             NOT NULL
);

CREATE TABLE IF NOT EXISTS category_member
(
    category_id TEXT NOT NULL REFERENCES category (id),
    ou_id       TEXT NOT NULL REFERENCES organisation_units (id),
    PRIMARY KEY (category_id, ou_id)
);

CREATE INDEX IF NOT EXISTS idx_category_member_ou ON category_member (ou_id);

-- Which categories a produit_programme_niveau is restricted to. No row: every
-- facility of its type owes it.
CREATE TABLE IF NOT EXISTS produit_programme_niveau_category
(
    ppn_id      TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (ppn_id, category_id)
);

ALTER TABLE produit_programme_niveau ADD COLUMN facility_type_id TEXT;
ALTER TABLE my_produitprogrammeniveau ADD COLUMN facility_type_id TEXT;
