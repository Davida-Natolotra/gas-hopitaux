-- Singleton row: this install's own device id, generated once on first app
-- start (see src/services/device-service.ts) and never regenerated
-- afterward, so it stays stable for the lifetime of this install.
CREATE TABLE IF NOT EXISTS device
(
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT    NOT NULL
);

-- The user profile for this device (GAS FS). In practice there is exactly
-- one row (one profile per device install), but the id is a generated uuid
-- (not a fixed singleton id) since it's a real user-owned record.
CREATE TABLE IF NOT EXISTS user_fs
(
    id        TEXT PRIMARY KEY NOT NULL,
    username  TEXT             NOT NULL,
    poste     TEXT             NOT NULL,
    phone     TEXT             NOT NULL,
    device_id TEXT             NOT NULL
);
