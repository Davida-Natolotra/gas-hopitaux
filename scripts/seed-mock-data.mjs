#!/usr/bin/env node
//
// Builds a complete, self-consistent mock database for GAS Hopitaux, then
// checks it against the app's own rules and reports what it produced.
//
// "Complete" means everything the app needs to be exercised end to end without
// touching a server: the imported configuration (organisation units, groups,
// programmes, produits, produit/programme/niveau links, with a couple of
// withdrawn entries kept as tombstones), the device's own choices (its FS, its
// device id, the user profile), and several consecutive months of reports whose
// figures actually agree with each other — opening stock carried from the month
// before, CMM averaged over the three preceding months, MSD and the situation
// label derived from those.
//
// The configuration is not invented: it is read verbatim from
// scripts/mock-data/utgl-config-reference.json, a real server export trimmed to
// the organisation units the app queries (see the header of
// scripts/mock-data/catalogue.mjs). Only the reports on top of it are generated.
// To refresh it, re-export from the server, drop the level-6 organisation units
// and their group memberships, and overwrite that file.
//
// It writes a fresh SQLite file rather than editing the live one, and stamps
// _sqlx_migrations exactly as tauri-plugin-sql's migrator would, so the app
// opens the result without re-running or rejecting anything.
//
//   node scripts/seed-mock-data.mjs
//   node scripts/seed-mock-data.mjs --months 12 --partial-last
//   node scripts/seed-mock-data.mjs --install        # replaces the app's own db
//   node scripts/seed-mock-data.mjs --dev-db         # throwaway db for `npm run dev:mock`
//
// Requires Node 22.5+ for the built-in node:sqlite module (this repo's toolchain
// is Node 24). No dependencies are installed for it.

import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {buildCatalogue, toConfigFile} from "./mock-data/catalogue.mjs";
import {buildRapports} from "./mock-data/rapports.mjs";
import {reportResults, verifyDatabase} from "./mock-data/verify.mjs";
import {monthKey, monthSeries, parseMonthKey, previousCalendarMonth} from "./mock-data/months.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "src-tauri", "migrations");
const LIB_RS = join(REPO_ROOT, "src-tauri", "src", "lib.rs");
const TAURI_CONF = join(REPO_ROOT, "src-tauri", "tauri.conf.json");

const USAGE = `
Usage : node scripts/seed-mock-data.mjs [options]

  --out <dossier>        Où écrire rfs.db et utgl_config.json (défaut : ./mock-data)
  --months <n>           Nombre de mois consécutifs à générer (défaut : 6)
  --anchor <AAAA-MM>     Mois le plus récent (défaut : le mois calendaire précédent)
  --seed <n>             Graine du générateur ; même graine = mêmes données (défaut : 20260813)
  --config-version <n>   Version de configuration à estampiller (défaut : celle de l'export)
  --partial-last         Laisse une partie du mois le plus récent non saisie
  --archive-mid          Retire les produits archivés au milieu de la série plutôt qu'au dernier mois
  --install              Remplace la base de l'application installée (sauvegarde préalable)
  --dev-db               Écrit la base de session jetable (rfs-dev.db) au lieu de la vraie ;
                         c'est ce qu'utilise « npm run dev:mock », qui la supprime en sortant
  --force                Écrase un rfs.db déjà présent dans --out
  --help                 Affiche ceci
`.trim();

function parseArgs(argv) {
    const options = {
        out: join(REPO_ROOT, "mock-data"),
        months: 6,
        anchor: null,
        seed: 20260813,
        configVersion: null,
        partialLast: false,
        archiveMid: false,
        install: false,
        devDb: false,
        force: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const value = () => {
            const next = argv[i + 1];
            if (next === undefined || next.startsWith("--")) throw new Error(`Valeur manquante après ${arg}.`);
            i += 1;
            return next;
        };
        switch (arg) {
            case "--out": options.out = resolve(value()); break;
            case "--months": options.months = Number(value()); break;
            case "--anchor": options.anchor = value(); break;
            case "--seed": options.seed = Number(value()); break;
            case "--config-version": options.configVersion = Number(value()); break;
            case "--partial-last": options.partialLast = true; break;
            case "--archive-mid": options.archiveMid = true; break;
            case "--install": options.install = true; break;
            case "--dev-db": options.devDb = true; break;
            case "--force": options.force = true; break;
            case "--help": case "-h": console.log(USAGE); process.exit(0); break;
            default: throw new Error(`Option inconnue : ${arg}\n\n${USAGE}`);
        }
    }

    if (!Number.isInteger(options.months) || options.months < 1) {
        throw new Error("--months attend un entier positif.");
    }
    // Below four months no report has three predecessors, so nothing would ever
    // exercise the rolling CMM — the most breakable rule in the app.
    if (options.months < 4) {
        console.warn("Note : avec moins de 4 mois, aucun rapport n'a de CMM calculé sur 3 mois.");
    }
    if (!Number.isInteger(options.seed)) throw new Error("--seed attend un entier.");
    if (options.install && options.devDb) {
        throw new Error("--install et --dev-db désignent deux bases différentes : choisissez l'une ou l'autre.");
    }
    return options;
}

// ── Schema ───────────────────────────────────────────────────────────────────

/**
 * The migration list as the app declares it in lib.rs, read from there rather
 * than restated here: a migration added to the app without this script noticing
 * would otherwise produce a database the app then tries to migrate on top of.
 */
function readMigrations() {
    const source = readFileSync(LIB_RS, "utf8");
    const pattern =
        /Migration\s*\{\s*version:\s*(\d+)\s*,\s*description:\s*"([^"]+)"\s*,\s*sql:\s*include_str!\("\.\.\/migrations\/([^"]+)"\)/g;

    const migrations = [];
    for (const match of source.matchAll(pattern)) {
        const [, version, description, file] = match;
        // The checksum has to be taken over the exact bytes include_str! embeds,
        // line endings included — sqlx refuses a migration whose recorded
        // checksum does not match the one it computes at startup.
        const sql = readFileSync(join(MIGRATIONS_DIR, file));
        migrations.push({
            version: Number(version),
            description,
            file,
            sql,
            checksum: createHash("sha384").update(sql).digest(),
        });
    }

    if (migrations.length === 0) {
        throw new Error(`Aucune migration trouvée dans ${LIB_RS} — le format du fichier a dû changer.`);
    }
    return migrations.sort((a, b) => a.version - b.version);
}

function createSchema(dbPath, migrations) {
    // Foreign keys stay off while the schema is built: migration 0007 rebuilds
    // five tables in place, and sqlx runs it as one transaction where the pragma
    // cannot be toggled. They go back on before any data is inserted.
    const db = new DatabaseSync(dbPath, {enableForeignKeyConstraints: false});

    // sqlx's own bookkeeping table, created verbatim so the app's migrator finds
    // what it expects.
    db.exec(`
        CREATE TABLE IF NOT EXISTS _sqlx_migrations
        (
            version        BIGINT PRIMARY KEY,
            description    TEXT     NOT NULL,
            installed_on   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success        BOOLEAN  NOT NULL,
            checksum       BLOB     NOT NULL,
            execution_time BIGINT   NOT NULL
        );
    `);

    const record = db.prepare(
        `INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
         VALUES (?, ?, 1, ?, ?)`,
    );

    for (const migration of migrations) {
        const started = process.hrtime.bigint();
        db.exec(migration.sql.toString("utf8"));
        const elapsed = Number(process.hrtime.bigint() - started);
        record.run(migration.version, migration.description, migration.checksum, elapsed);
    }

    db.close();
}

// ── Insertion ────────────────────────────────────────────────────────────────

function insertAll(db, catalogue, {rapports, lignes, detailSdu}, importedAt) {
    const insert = (sql, rows) => {
        if (rows.length === 0) return;
        const statement = db.prepare(sql);
        for (const row of rows) statement.run(...row);
    };

    // Parents before children throughout: foreign keys are enforced here on
    // purpose, so a dataset that does not hang together fails loudly at insert
    // time instead of quietly in the app.
    insert(
        "INSERT INTO organisation_units (id, name, level, parent_id) VALUES (?, ?, ?, ?)",
        [...catalogue.organisationUnits]
            .sort((a, b) => a.level - b.level)
            .map((ou) => [ou.id, ou.name, ou.level, ou.parent_id]),
    );

    insert(
        "INSERT INTO organisation_unit_group (id, name, short_name, active, archived_at) VALUES (?, ?, ?, 1, NULL)",
        catalogue.groups.map((group) => [group.id, group.name, group.short_name]),
    );

    insert(
        "INSERT INTO organisation_unit_group_member (group_id, ou_id) VALUES (?, ?)",
        catalogue.groups.flatMap((group) => group.organisation_units.map((ouId) => [group.id, ouId])),
    );

    insert(
        "INSERT INTO programme (id, name, active, archived_at) VALUES (?, ?, 1, NULL)",
        catalogue.programmes.map((programme) => [programme.id, programme.name]),
    );

    insert(
        `INSERT INTO produit (id, name, unit, code, uuid_dhis2, active, archived_at)
         VALUES (?, ?, ?, ?, ?, 1, NULL)`,
        catalogue.produits.map((p) => [p.id, p.name, p.unit, p.code, p.uuid_dhis2]),
    );

    insert(
        `INSERT INTO produit_programme_niveau
             (id, produit_id, programme_id, org_group_id, org_group_name, "order", active, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, NULL)`,
        catalogue.ppn.map((row) => [
            row.id, row.produit_id, row.programme_id, row.org_group_id, row.org_group_name, row.order,
        ]),
    );

    db.prepare(
        "INSERT INTO my_organisation_unit (id, drsp_id, sdsp_id, commune_id, fs_id) VALUES (1, ?, ?, ?, ?)",
    ).run(
        catalogue.myOrganisationUnit.drsp_id,
        catalogue.myOrganisationUnit.sdsp_id,
        catalogue.myOrganisationUnit.commune_id,
        catalogue.myOrganisationUnit.fs_id,
    );

    // The materialised subset, built by the same rule as
    // refreshMyProduitProgrammeNiveau().
    insert(
        `INSERT INTO my_produitprogrammeniveau
             (id, produit_id, programme_id, org_group_id, org_group_name, "order", active, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, NULL)`,
        catalogue.myPpn.map((row) => [
            row.id, row.produit_id, row.programme_id, row.org_group_id, row.org_group_name, row.order,
        ]),
    );

    // Withdrawn entries are marked, never deleted — same as applyTombstones().
    const markPpn = db.prepare(
        "UPDATE produit_programme_niveau SET active = 0, archived_at = ? WHERE id = ?",
    );
    const markMyPpn = db.prepare(
        "UPDATE my_produitprogrammeniveau SET active = 0, archived_at = ? WHERE id = ?",
    );
    for (const tombstone of catalogue.deactivated) {
        markPpn.run(tombstone.archived_at, tombstone.id);
        markMyPpn.run(tombstone.archived_at, tombstone.id);
    }

    db.prepare(
        `INSERT INTO config_version (id, version, schema, published_at, checksum, imported_at)
         VALUES (1, ?, 3, ?, NULL, ?)`,
    ).run(catalogue.configVersion, importedAt, importedAt);

    db.prepare("INSERT INTO device (id, device_id) VALUES (1, ?)").run(catalogue.device.device_id);
    db.prepare("INSERT INTO user_fs (id, username, poste, phone, device_id) VALUES (?, ?, ?, ?, ?)").run(
        catalogue.user.id,
        catalogue.user.username,
        catalogue.user.poste,
        catalogue.user.phone,
        catalogue.user.device_id,
    );

    insert(
        `INSERT INTO rapportfs (id, name, created, exported_date, status, mois_annee, fs_id, edited_by, config_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rapports.map((r) => [
            r.id, r.name, r.created, r.exported_date, r.status, r.mois_annee, r.fs_id, r.edited_by, r.config_version,
        ]),
    );

    insert(
        `INSERT INTO rapportfs_ligne
             (id, rapportfs_id, produit_programme_niveau_id, qte_dispo_deb_mois, qte_rec_mois, qte_dist_patient,
              qte_perime_avarie_mois, qte_redepl_mois, nb_jour_rupture, stock_theorique, sdu_fin_mois, ecart,
              cmm, cmma, msd, situation, observation, produit_code, produit_name, produit_unit, programme_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        lignes.map((l) => [
            l.id, l.rapportfs_id, l.produit_programme_niveau_id, l.qte_dispo_deb_mois, l.qte_rec_mois,
            l.qte_dist_patient, l.qte_perime_avarie_mois, l.qte_redepl_mois, l.nb_jour_rupture, l.stock_theorique,
            l.sdu_fin_mois, l.ecart, l.cmm, l.cmma, l.msd, l.situation, l.observation,
            l.produit_code, l.produit_name, l.produit_unit, l.programme_name,
        ]),
    );

    insert(
        "INSERT INTO detail_sdu (id, rapportfs_ligne_id, sdu, date_peremption) VALUES (?, ?, ?, ?)",
        detailSdu.map((d) => [d.id, d.rapportfs_ligne_id, d.sdu, d.date_peremption]),
    );
}

// ── Installing over the app's own database ───────────────────────────────────

/**
 * The app's data directory, where tauri-plugin-sql opens `sqlite:<file>`.
 *
 * `DEV_DB_FILE` is the throwaway database a `npm run dev:mock` session talks to
 * instead of the real one (see src/services/db.ts): mock data can then never
 * end up in rfs.db, and the launcher deletes it when the session ends.
 */
export const DEV_DB_FILE = "rfs-dev.db";

export function appDatabasePath(fileName = "rfs.db") {
    const identifier = JSON.parse(readFileSync(TAURI_CONF, "utf8")).identifier;
    // Where Tauri's app_data_dir lands per platform (see src-tauri/src/backup.rs,
    // which resolves the same directory from inside the app).
    if (process.platform === "win32") {
        if (!process.env.APPDATA) throw new Error("APPDATA introuvable dans l'environnement.");
        return join(process.env.APPDATA, identifier, fileName);
    }
    if (process.platform === "darwin") {
        return join(process.env.HOME, "Library", "Application Support", identifier, fileName);
    }
    const base = process.env.XDG_DATA_HOME ?? join(process.env.HOME, ".local", "share");
    return join(base, identifier, fileName);
}

/** Deletes a database and the journal files that belong to it. */
export function removeDatabase(target) {
    for (const suffix of ["", "-wal", "-shm"]) {
        const path = `${target}${suffix}`;
        if (existsSync(path)) rmSync(path);
    }
}

function installOverAppDatabase(generatedPath, {fileName = "rfs.db", backupFirst = true} = {}) {
    const target = appDatabasePath(fileName);
    mkdirSync(dirname(target), {recursive: true});

    let backup = null;
    if (backupFirst && existsSync(target)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        backup = `${target}.backup-${stamp}`;
        copyFileSync(target, backup);
    }

    // The journal files belong to the database being replaced; leaving them in
    // place would let SQLite recover the old content over the new file.
    removeDatabase(target);

    copyFileSync(generatedPath, target);
    return {target, backup};
}

// ── Summary ──────────────────────────────────────────────────────────────────

function summarise(db, log) {
    const one = (sql) => db.prepare(sql).get();
    const all = (sql) => db.prepare(sql).all();

    const fs = one(
        `SELECT fs.name AS fs, sdsp.name AS sdsp, drsp.name AS drsp
         FROM my_organisation_unit m
                  JOIN organisation_units fs ON fs.id = m.fs_id
                  JOIN organisation_units sdsp ON sdsp.id = m.sdsp_id
                  JOIN organisation_units drsp ON drsp.id = m.drsp_id
         WHERE m.id = 1`,
    );
    const config = one("SELECT version, schema FROM config_version WHERE id = 1");
    const user = one("SELECT username, poste FROM user_fs LIMIT 1");

    log("");
    log(`  FS            ${fs.fs}`);
    log(`  Rattachement  ${fs.drsp} › ${fs.sdsp}`);
    log(`  Utilisateur   ${user.username} — ${user.poste}`);
    log(`  Configuration v${config.version} (schéma ${config.schema})`);
    const niveaux = all(
        `SELECT g.name AS name
         FROM organisation_unit_group_member m
                  JOIN organisation_unit_group g ON g.id = m.group_id
         WHERE m.ou_id = (SELECT fs_id FROM my_organisation_unit WHERE id = 1)
         ORDER BY g.name`,
    ).map((row) => row.name);
    log(`  Niveaux       ${niveaux.join(", ")}`);

    const counts = all(`
        SELECT 'unités d''organisation' AS objet, COUNT(*) AS n FROM organisation_units
        UNION ALL SELECT 'groupes', COUNT(*) FROM organisation_unit_group
        UNION ALL SELECT 'programmes', COUNT(*) FROM programme
        UNION ALL SELECT 'produits', COUNT(*) FROM produit
        UNION ALL SELECT 'liaisons produit/programme/niveau', COUNT(*) FROM produit_programme_niveau
        UNION ALL SELECT '  dont applicables à cette FS', COUNT(*) FROM my_produitprogrammeniveau
        UNION ALL SELECT '  dont retirées de la config', COUNT(*) FROM my_produitprogrammeniveau WHERE active = 0
        UNION ALL SELECT 'rapports', COUNT(*) FROM rapportfs
        UNION ALL SELECT 'lignes de rapport', COUNT(*) FROM rapportfs_ligne
        UNION ALL SELECT 'détails SDU', COUNT(*) FROM detail_sdu
    `);
    log("");
    for (const row of counts) log(`  ${String(row.n).padStart(5)}  ${row.objet}`);

    const months = all(`
        SELECT r.mois_annee,
               r.status,
               r.exported_date IS NOT NULL AS exporte,
               COUNT(l.id)                 AS lignes,
               SUM(l.cmm IS NOT NULL)      AS avec_cmm
        FROM rapportfs r
                 LEFT JOIN rapportfs_ligne l ON l.rapportfs_id = r.id
        GROUP BY r.id
        ORDER BY r.mois_annee
    `);
    log("");
    log("  Mois      Statut     Lignes  Avec CMM  Exporté");
    for (const row of months) {
        log(
            `  ${row.mois_annee}   ${(row.status ? "Complet" : "Incomplet").padEnd(9)}  ` +
            `${String(row.lignes).padStart(6)}  ${String(row.avec_cmm).padStart(8)}  ${row.exporte ? "oui" : "—"}`,
        );
    }

    const latest = one("SELECT id, mois_annee FROM rapportfs ORDER BY mois_annee DESC LIMIT 1");
    const situations = db.prepare(
        `SELECT CASE WHEN situation = '' THEN '(non calculée)' ELSE situation END AS situation,
                COUNT(*) AS n
         FROM rapportfs_ligne
         WHERE rapportfs_id = ?
         GROUP BY 1
         ORDER BY n DESC`,
    ).all(latest.id);
    log("");
    log(`  Situations au ${latest.mois_annee} (page Alertes) :`);
    for (const row of situations) log(`  ${String(row.n).padStart(5)}  ${row.situation}`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

function main() {
    const options = parseArgs(process.argv.slice(2));
    const log = console.log;

    const anchor = options.anchor ? parseMonthKey(options.anchor) : previousCalendarMonth();
    const months = monthSeries(anchor, options.months);
    // Where the withdrawn produits stop being collected. By default that is the
    // newest month, so every report still carries them and none comes out
    // incomplete because of it; --archive-mid moves it back into the series.
    const archiveMonth = options.archiveMid
        ? months[Math.floor((months.length - 1) / 2)]
        : months[months.length - 1];

    const catalogue = buildCatalogue({
        seed: options.seed,
        archiveMonth,
        configVersion: options.configVersion,
    });
    const rapportData = buildRapports({
        catalogue,
        seed: options.seed,
        months,
        partialLast: options.partialLast,
    });

    mkdirSync(options.out, {recursive: true});
    const dbPath = join(options.out, "rfs.db");
    if (existsSync(dbPath)) {
        if (!options.force) {
            throw new Error(`${dbPath} existe déjà. Relancez avec --force pour l'écraser.`);
        }
        for (const suffix of ["", "-wal", "-shm"]) {
            if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
        }
    }

    log(`Génération : ${options.months} mois (${months[0].key} → ${months[months.length - 1].key}), graine ${options.seed}`);

    const migrations = readMigrations();
    createSchema(dbPath, migrations);
    log(`Schéma     : ${migrations.length} migrations appliquées et enregistrées comme sqlx le ferait`);

    const db = new DatabaseSync(dbPath, {enableForeignKeyConstraints: true});
    db.exec("BEGIN");
    try {
        insertAll(db, catalogue, rapportData, new Date().toISOString());
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        db.close();
        throw error;
    }

    // The config file the server would have published for this dataset, so the
    // import screen can be exercised on its own — importing it into a device
    // seeded from here is a no-op, which is itself worth being able to test.
    const configPath = join(options.out, "utgl_config.json");
    writeFileSync(
        configPath,
        `${JSON.stringify(toConfigFile(catalogue, months[months.length - 1].key + "-28T08:00:00Z"), null, 2)}\n`,
        "utf8",
    );

    summarise(db, log);

    log("");
    log("Vérifications :");
    const results = verifyDatabase(db);
    const failed = reportResults(results, log);
    db.close();

    log("");
    log(`Base       : ${dbPath}`);
    log(`Config     : ${configPath}`);

    if (catalogue.deactivated.length > 0) {
        const archivedKey = monthKey(archiveMonth);
        log("");
        log(`Note       : ${catalogue.archivedPpnIds.size} liaison(s) produit/programme retirée(s) de la ` +
            `configuration au ${archivedKey}.`);
        if (options.archiveMid) {
            log("             Les mois suivants seront « Incomplet » : refreshRapportFsStatus compte tous les");
            log("             produits de my_produitprogrammeniveau, archivés compris, alors que la page de");
            log("             saisie ne les propose plus. C'est le comportement de l'application, reproduit tel");
            log("             quel — sans --archive-mid, le retrait tombe sur le dernier mois et ne se voit pas.");
        }
    }

    if (failed > 0) {
        log("");
        log(`${failed} vérification(s) en échec — la base générée n'est pas cohérente.`);
        process.exitCode = 1;
        return;
    }

    if (options.devDb) {
        // No backup: this database exists only for the current dev session and
        // the launcher deletes it on the way out.
        const {target} = installOverAppDatabase(dbPath, {fileName: DEV_DB_FILE, backupFirst: false});
        log("");
        log(`Session    : ${target}`);
        log("             Base jetable : rfs.db n'est pas touchée, et celle-ci disparaît");
        log("             à la fermeture de « npm run dev:mock ».");
    } else if (options.install) {
        const {target, backup} = installOverAppDatabase(dbPath);
        log("");
        log(`Installée  : ${target}`);
        log(backup ? `Sauvegarde : ${backup}` : "Sauvegarde : aucune (pas de base existante)");
        log("             Fermez l'application avant l'installation et rouvrez-la ensuite.");
    } else {
        log("");
        log("Pour l'utiliser dans l'application : relancez avec --install, ou copiez rfs.db dans le");
        log(`dossier de données de l'application (${dirname(appDatabasePath())}), application fermée.`);
    }
}

// Only when run directly: dev-mock.mjs imports appDatabasePath/removeDatabase
// from here rather than restating where the database lives.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(`\nÉchec : ${error.message}`);
        process.exitCode = 1;
    }
}
