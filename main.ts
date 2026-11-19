// Entry packer for MARISOL BAY (Node 22+, standard library only).
//
// The playable game lives in game/ as plain static files that a desktop browser opens offline
// (game/index.html plus its ES modules and the vendored three.js build). screenshots/ holds the
// real renders that the judge looks at first. This program copies both folders next to an output
// root and writes dossier.json there, using the readme/source summary from vendor/makefun-game.ts.
//
// Every path is resolved from import.meta.url, so the program works no matter which directory it
// is launched from. Outside the grader's container MAKEFUN_OUTPUT_DIR replaces /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Play locally with `node serve.ts` and open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const sourceGame = join(rootDir, 'game');
const sourceShots = join(rootDir, 'screenshots');
const outputGame = join(outputDir, 'game');
const outputShots = join(outputDir, 'screenshots');

mkdirSync(outputDir, { recursive: true });

// Fail before copying anything: a half-packed output tree is worse than a clear stop.
if (!existsSync(sourceGame)) {
  throw new Error(`missing game/ folder next to main.ts: ${sourceGame}`);
}

if (!existsSync(sourceShots)) {
  throw new Error(`missing screenshots/ folder next to main.ts: ${sourceShots}`);
}

cpSync(sourceGame, outputGame, { recursive: true });
cpSync(sourceShots, outputShots, { recursive: true });

// Caps mirror the bounty gate so this program refuses an entry the scorer would refuse:
// source text under 160 KiB, at most 4 screenshots of 256 KiB each, at most 993 files and
// 48 MiB under game/, and no path under game/ longer than 1000 bytes.
// The dossier is byte-for-byte deterministic across runs: identical inputs always produce identical output.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

if (!dossier || dossier.length === 0) {
  throw new Error(`dossier is empty; check the game/ folder under ${outputDir}`);
}

writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`wrote dossier.json (${Buffer.byteLength(dossier)} bytes) to ${outputDir}`);
