// Assembles the offline web app into www/ — Capacitor's webDir. This is purely a
// packaging step for the native (Capacitor/Android) build: it copies the SAME files
// GitHub Pages serves from the repo root into www/ unchanged, so the native app wraps
// an exact copy of the web app. Never edit files under www/ directly — it's rebuilt
// clean on every run and is gitignored.
//
// Run directly: node scripts/build-www.mjs (or `npm run build:www`)

import { cp, rm, mkdir } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const WWW = new URL("../www/", import.meta.url);

// [source relative to repo root, dest relative to www/]
const ENTRIES = [
  ["index.html", "index.html"],
  ["src", "src"],
  ["data", "data"],
  ["manifest.webmanifest", "manifest.webmanifest"],
  ["sw.js", "sw.js"],
  ["icons", "icons"],
  ["fonts", "fonts"],
];

async function main() {
  await rm(WWW, { recursive: true, force: true });
  await mkdir(WWW, { recursive: true });

  for (const [src, dest] of ENTRIES) {
    const srcUrl = new URL(src, ROOT);
    const destUrl = new URL(dest, WWW);
    await cp(srcUrl, destUrl, { recursive: true });
    console.log(`copied ${src} -> www/${dest}`);
  }

  console.log(`www/ built from ${ENTRIES.length} source entries.`);
}

// Only run when executed directly (same guard style as build-data.mjs/build-mi.mjs),
// so this module can be imported by tests without side effects.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
