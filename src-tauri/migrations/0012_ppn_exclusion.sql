-- Produits a hospital has chosen not to report (Paramètres → Produits).
--
-- Every produit × programme row the facility owes through its categories is reported
-- unless it is listed here, so a row a new configuration adds is reported without
-- anyone having to tick it. Keyed by facility as well: a device moved to another
-- hospital does not carry the first one's choices across, and finds them again if it
-- comes back. Unchecking a row hides it from reports, their completeness, the CMM
-- pass and the export; figures already entered for it are never deleted, and a report
-- that has some keeps showing and sending them.
CREATE TABLE IF NOT EXISTS ppn_exclusion
(
    fs_id  TEXT NOT NULL,
    ppn_id TEXT NOT NULL,
    PRIMARY KEY (fs_id, ppn_id)
);
