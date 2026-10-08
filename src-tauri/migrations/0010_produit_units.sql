-- Produit units and the Assignation (configuration schema 6).
--
-- A produit can be reported in several units (Comprimé, Flacon, Boîte de 100…), and
-- the server's Assignation says, per field app, which categories it serves and which
-- unit it reports each produit_programme_niveau in — per row, not per produit: the
-- row (produit × programme × categories) is what reports are collected against.
--
-- produit_programme_niveau.report_unit / report_unit_id: the unit THIS app reports
-- the row in (its produit's reference unit unless the Assignation names another) and
-- its server id — both null until a schema 6 configuration is imported, when the row
-- is reported in produit.unit. Every new report line copies them, as produit_unit /
-- produit_unit_id, so the server knows which unit its quantities are in.
--
-- app_category is every app's roster: the categories whose members use it. Empty
-- until a schema 6 configuration is imported, and while it is, each app's roster is
-- the category it was built around, by name — see inAppRoster in
-- features/configuration/services/applicability.ts.

ALTER TABLE produit_programme_niveau ADD COLUMN report_unit TEXT;
ALTER TABLE produit_programme_niveau ADD COLUMN report_unit_id TEXT;

CREATE TABLE IF NOT EXISTS app_category
(
    app         TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (app, category_id)
);

ALTER TABLE rapportfs_ligne ADD COLUMN produit_unit_id TEXT;
