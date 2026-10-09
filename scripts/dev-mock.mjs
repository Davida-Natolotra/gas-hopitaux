#!/usr/bin/env node
//
// Runs the app against a throwaway database full of mock data.
//
//   npm run dev:mock
//   npm run dev:mock -- --months 12 --partial-last
//
// Three things happen, in order:
//
//   1. seed-mock-data.mjs builds a fresh dataset into a temporary folder and
//      copies it to rfs-dev.db in the app's data directory. It follows the
//      configuration already imported into rfs.db, and the hospital saved there,
//      when there is one (--from-installed: rfs.db is only read), and the bundled
//      reference configuration otherwise;
//   2. `tauri dev` starts with VITE_MOCK_DB=1, which is what makes
//      src/services/db.ts open rfs-dev.db instead of rfs.db;
//   3. when the app closes, rfs-dev.db and the temporary folder are deleted.
//
// So the real database is never touched, and nothing survives the session. The
// deletion also runs on the way *in*, because a crash or a killed terminal can
// skip step 3 — starting fresh is the guarantee, cleaning up on exit is only
// the courtesy.
//
// Use scripts/seed-mock-data.mjs --install instead when you want mock data that
// stays put.

import {spawn} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {appDatabasePath, DEV_DB_FILE, removeDatabase} from "./seed-mock-data.mjs";

const SEEDER = resolve(fileURLToPath(import.meta.url), "..", "seed-mock-data.mjs");
const devDbPath = appDatabasePath(DEV_DB_FILE);

let workDir = null;
let cleanedUp = false;

function cleanUp() {
    if (cleanedUp) return;
    cleanedUp = true;
    // Best effort: on Windows the file stays locked for a moment after the app
    // exits, and a session that could not be cleaned up is still wiped by the
    // next run.
    try {
        removeDatabase(devDbPath);
    } catch (error) {
        console.warn(`\nNote : ${devDbPath} n'a pas pu être supprimée (${error.code ?? error.message}).`);
        console.warn("       Elle sera écrasée au prochain « npm run dev:mock ».");
    }
    if (workDir) {
        try {
            rmSync(workDir, {recursive: true, force: true});
        } catch {
            // A leftover folder in the OS temp directory is harmless.
        }
    }
}

/** Runs a command to completion, inheriting stdio; resolves with its exit code. */
function run(command, args, options = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
        // shell:true so `npm` resolves to npm.cmd on Windows. The shell gets one
        // command line: Node refuses to splice an argument list into one itself.
        const shell = options.shell ?? true;
        const child = shell
            ? spawn([command, ...args].join(" "), {stdio: "inherit", shell: true, ...options})
            : spawn(command, args, {stdio: "inherit", ...options});
        child.on("error", rejectPromise);
        child.on("close", (code, signal) => resolvePromise(signal ? 1 : (code ?? 0)));
    });
}

async function main() {
    // Whatever a previous session left behind, including a database the app is
    // no longer using but SQLite still has journal files for.
    removeDatabase(devDbPath);

    workDir = mkdtempSync(join(tmpdir(), "utgl-mock-"));

    const seedArgs = [SEEDER, "--dev-db", "--force", "--from-installed", "--out", workDir, ...process.argv.slice(2)];
    const seeded = await run(process.execPath, seedArgs, {shell: false});
    if (seeded !== 0) {
        cleanUp();
        process.exitCode = seeded;
        return;
    }

    console.log("");
    console.log("Démarrage de l'application sur la base de session…");
    console.log("");

    // VITE_MOCK_DB reaches import.meta.env because Vite copies VITE_-prefixed
    // variables out of process.env.
    const code = await run("npm", ["run", "tauri", "--", "dev"], {
        env: {...process.env, VITE_MOCK_DB: "1"},
    });

    cleanUp();
    console.log("");
    console.log("Session terminée : la base de test a été supprimée, rfs.db est intacte.");
    process.exitCode = code;
}

// Ctrl+C reaches this process as well as the child. Ignore it the first time so
// the app can wind down and the normal path below does the cleanup; a second
// one means it is not winding down, so leave anyway.
let interrupts = 0;
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        interrupts += 1;
        if (interrupts === 1) {
            console.log("\nFermeture de l'application… (Ctrl+C à nouveau pour forcer)");
            return;
        }
        cleanUp();
        process.exit(130);
    });
}
process.on("exit", cleanUp);

main().catch((error) => {
    cleanUp();
    console.error(`\nÉchec : ${error.message}`);
    process.exitCode = 1;
});
