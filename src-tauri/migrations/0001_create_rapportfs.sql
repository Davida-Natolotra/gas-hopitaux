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

INSERT INTO rapportfs (id, name, created, exported_date, status, mois_annee, fs_id, edited_by)
VALUES ('a3f1c2d4-1111-4a2b-9c3d-000000000001', 'Rapport FS Juin 2026', '2026-06-28T10:15:00Z',
        '2026-07-05', 1, '2026-06-01', 'fs-001', 'user-001'),
       ('a3f1c2d4-1111-4a2b-9c3d-000000000002', 'Rapport FS Mai 2026', '2026-05-30T09:00:00Z', NULL,
        0, '2026-05-01', 'fs-001', 'user-002'),
       ('a3f1c2d4-1111-4a2b-9c3d-000000000003', 'Rapport FS Avril 2026', '2026-04-29T14:42:00Z',
        '2026-05-03', 1, '2026-04-01', 'fs-002', 'user-001');
