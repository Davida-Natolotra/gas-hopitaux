-- Produits configured once per programme, for categories only (configuration
-- schema 5).
--
-- The facility types the previous migration introduced (CSB, HOPITAUX) are
-- categories now, alongside CTTR, CR, CDT, …, and categories are shared by every
-- programme. A facility owes a produit_programme_niveau when it is a member of at
-- least one of the row's categories (produit_programme_niveau_category). See
-- features/configuration/services/applicability.ts.
--
-- produit_programme_niveau keeps its legacy org_group_id / org_group_name
-- columns: a schema 5 import fills org_group_name with the row's category names
-- and org_group_id with the row's own id, so the old UNIQUE (produit, programme,
-- org_group_id) can never refuse a row the server considers distinct. A row with
-- no category links and a group id in org_group_id is one imported before the
-- change — see legacyPpnAppliesTo.

DROP TABLE IF EXISTS facility_type_member;
DROP TABLE IF EXISTS facility_type;

ALTER TABLE produit_programme_niveau DROP COLUMN facility_type_id;
ALTER TABLE my_produitprogrammeniveau DROP COLUMN facility_type_id;
ALTER TABLE category DROP COLUMN programme_id;
