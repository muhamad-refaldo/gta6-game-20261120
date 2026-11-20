// main.ts — entrypoint for the Solara City game (make.fun gta6-01).
// Copies the game and its screenshots into the output directory and writes
// the dossier the judges read. Node 22 standard library only.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory this file lives in, so paths work wherever the grader runs it.
const here = fileURLToPath(new URL('.', import.meta.url));

// The grader writes to /output; locally MAKEFUN_OUTPUT_DIR stands in for it.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(out, { recursive: true });

// Ship the whole game: every file under game/ is plain static content.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// Ship the screenshots, when the repo carries any.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier describes the game for the judge: sources, vendored files,
// assets, totals, and the screenshots. It must match what buildDossier
// writes from exactly these files, so the gate can compare byte for byte.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000
  })
);
