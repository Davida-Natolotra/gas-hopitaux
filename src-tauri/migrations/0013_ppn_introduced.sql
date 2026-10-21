-- When each produit first became one a hospital reports, per hospital.
--
-- A report owes the produits that were in the configuration for its month, not
-- the ones installed today. Without this, a configuration imported later adds
-- its new produits to every past month too: a report that was "Complet" shows
-- empty rows it never had and turns "Incomplet". See reportListsPpn in
-- features/configuration/services/applicability.ts.
--
-- Keyed by facility like ppn_exclusion, because a report is judged by its own
-- facility's produits, and a device moved between hospitals keeps each one's
-- history. Only ever gains rows: my_produitprogrammeniveau is rebuilt (DELETE
-- then INSERT) on every configuration import and organisation-unit save.
--
-- introduced_at is the device's local date (YYYY-MM-DD) the row first appeared
-- in my_produitprogrammeniveau for that facility. NULL — or no row at all —
-- means "always": the rows present now, and every row of the first
-- configuration a facility gets on this device. When those were added is not
-- known, so they stay owed by every month, as before.
CREATE TABLE IF NOT EXISTS ppn_introduced
(
    fs_id         TEXT NOT NULL,
    ppn_id        TEXT NOT NULL,
    introduced_at TEXT,
    PRIMARY KEY (fs_id, ppn_id)
);

INSERT OR IGNORE INTO ppn_introduced (fs_id, ppn_id, introduced_at)
SELECT mou.fs_id, mppn.id, NULL
FROM my_produitprogrammeniveau mppn
         JOIN my_organisation_unit mou ON mou.id = 1;
