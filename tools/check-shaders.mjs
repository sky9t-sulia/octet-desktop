/**
 * Proves the shaders are still the Android app's, byte for byte.
 *
 *   node tools/check-shaders.mjs
 *
 * The tube is the one part of this app that must not be a port. A picture that
 * is processed even slightly differently from the phone's is a different
 * picture, and the difference would be invisible until somebody put the two
 * side by side. So they are copies, and this says so out loud: it compares the
 * bytes and exits non-zero on any drift, in either direction.
 *
 * If a shader is deliberately changed, change it in octet-android and copy it
 * across — not the other way round, and not only here.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OURS = join(HERE, "../src/play/shaders");
const THEIRS = resolve(
  process.argv[2] ?? join(HERE, "../../octet-android/app/src/main/res/raw"),
);

const SHADERS = ["vertex.glsl", "tube.glsl"];

let drifted = 0;
for (const name of SHADERS) {
  let mine;
  let theirs;
  try {
    mine = readFileSync(join(OURS, name));
  } catch {
    console.log(`${name.padEnd(12)} MISSING here`);
    drifted++;
    continue;
  }
  try {
    theirs = readFileSync(join(THEIRS, name));
  } catch {
    console.log(`${name.padEnd(12)} SKIPPED — no octet-android beside this repo`);
    continue;
  }
  if (mine.equals(theirs)) {
    console.log(`${name.padEnd(12)} identical (${mine.length} bytes)`);
  } else {
    console.log(
      `${name.padEnd(12)} DRIFTED — ${mine.length} bytes here, ${theirs.length} in octet-android`,
    );
    drifted++;
  }
}

process.exit(drifted === 0 ? 0 : 1);
