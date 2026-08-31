// Deterministic randomness for the mock dataset.
//
// Everything the generator produces has to come out identical for a given
// --seed: a fixture you cannot regenerate byte-for-byte is a fixture you cannot
// reason about when a test that used it starts failing. So no Math.random() and
// no crypto.randomUUID() anywhere below — ids are derived from the seed too.

/** Small, fast, fully deterministic PRNG (mulberry32). Returns [0, 1). */
export function makeRng(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

import {createHash} from "node:crypto";

/**
 * A stable uuid for a logical name, derived from the run's seed — same shape as
 * the crypto.randomUUID() values the app writes (see id-service.ts), but
 * reproducible, so two runs of this script agree on every primary key and a
 * regenerated database can be diffed against the previous one.
 */
export function makeUuidFactory(seed) {
    return function uuidFor(name) {
        const hash = createHash("sha1").update(`${seed}:${name}`).digest();
        // Version 5 / RFC 4122 variant bits, so the value is a well-formed uuid
        // rather than 32 arbitrary hex characters.
        hash[6] = (hash[6] & 0x0f) | 0x50;
        hash[8] = (hash[8] & 0x3f) | 0x80;
        const hex = hash.subarray(0, 16).toString("hex");
        return [
            hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32),
        ].join("-");
    };
}

/** Integer in [min, max], both inclusive. */
export function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
}

/** Float in [min, max). */
export function randFloat(rng, min, max) {
    return min + rng() * (max - min);
}

export function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
}

/** Picks from [[value, weight], ...]. */
export function weighted(rng, entries) {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = rng() * total;
    for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
}

/** True with the given probability. */
export function chance(rng, probability) {
    return rng() < probability;
}
