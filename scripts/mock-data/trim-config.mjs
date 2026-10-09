#!/usr/bin/env node
//
// Turns a server configuration export (utgl-web's export_config.py) into
// utgl-config-reference.json, the reference the mock dataset is built on.
//
// The only change is the trim: the export's level-6 organisation units are
// dropped, along with their group and category memberships, because the app never
// reads them — listOrganisationUnits() queries levels 2-5 and the cascade selects
// level 5 — and they are four fifths of the file. Everything else is kept
// verbatim, ids, version and checksum included.
//
//   node scripts/mock-data/trim-config.mjs <utgl_config.json> [sortie.json]

import {readFileSync, writeFileSync} from "node:fs";

import {CONFIG_SCHEMA, REFERENCE_CONFIG_PATH} from "./catalogue.mjs";

const MAX_LEVEL = 5;

const [input, output = REFERENCE_CONFIG_PATH] = process.argv.slice(2);
if (!input) {
    console.error("Usage : node scripts/mock-data/trim-config.mjs <utgl_config.json> [sortie.json]");
    process.exit(1);
}

const config = JSON.parse(readFileSync(input, "utf8"));
if (config.schema !== CONFIG_SCHEMA) {
    console.error(`Export au schéma ${config.schema}, ${CONFIG_SCHEMA} attendu.`);
    process.exit(1);
}

const organisationUnits = config.organisation_units.filter((ou) => ou.level <= MAX_LEVEL);
const kept = new Set(organisationUnits.map((ou) => ou.id));
const keepMembers = (owner) => ({...owner, organisation_units: owner.organisation_units.filter((id) => kept.has(id))});

const trimmed = {
    ...config,
    organisation_units: organisationUnits,
    organisation_unit_groups: config.organisation_unit_groups.map(keepMembers),
    categories: config.categories.map(keepMembers),
};

writeFileSync(output, `${JSON.stringify(trimmed, null, 1)}\n`, "utf8");
console.log(
    `${output} : ${config.organisation_units.length - organisationUnits.length} unités de niveau 6 retirées, ` +
    `${organisationUnits.length} conservées ; schéma ${trimmed.schema}, version ${trimmed.version}.`,
);
