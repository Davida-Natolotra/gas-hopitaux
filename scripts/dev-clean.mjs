#!/usr/bin/env node
//
// Runs the app from nothing: deletes the saved database, then starts `tauri dev`.
//
//   npm run dev:clean
//
// What is deleted is everything the app keeps — rfs.db (configuration, saved
// hospital, user profile, device id, reports) and its journal files — plus any
// rfs-dev.db a `dev:mock` session left behind. No backup is made: use the app's
// own backup (Paramètres) first if the data matters. The app then starts on an
// empty database, runs every migration, and opens on the setup wizard, the way a
// fresh install does.
//
// Close any running instance first: on Windows the file is locked while the app
// has it open, and on Linux/macOS deleting it under a running app leaves that app
// writing to a file nobody will see again.

import {spawn} from "node:child_process";
import {existsSync} from "node:fs";

import {appDatabasePath, DEV_DB_FILE, removeDatabase} from "./seed-mock-data.mjs";

/** Runs a command to completion, inheriting stdio; resolves with its exit code. */
function run(command, args, options = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
        // shell:true so `yarn` resolves to yarn.cmd on Windows. The shell gets one
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
    for (const fileName of ["rfs.db", DEV_DB_FILE]) {
        const target = appDatabasePath(fileName);
        if (!existsSync(target)) continue;
        try {
            removeDatabase(target);
        } catch (error) {
            throw new Error(
                `${target} n'a pas pu être supprimée (${error.code ?? error.message}). ` +
                "Fermez l'application et relancez.",
            );
        }
        console.log(`Supprimée : ${target}`);
    }

    console.log("");
    console.log("Démarrage de l'application sur une base vide…");
    console.log("");

    process.exitCode = await run("yarn", ["tauri", "dev"]);
}

// Ctrl+C reaches the child as well; let it wind down rather than leaving first.
// A second one means it is not winding down, so leave anyway.
let interrupts = 0;
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        interrupts += 1;
        if (interrupts > 1) process.exit(130);
    });
}

main().catch((error) => {
    console.error(`\nÉchec : ${error.message}`);
    process.exitCode = 1;
});
