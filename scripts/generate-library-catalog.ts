/**
 * Generates src/data/libraryCatalog.json — the seed manifest for the v3 library.
 *
 * Five tiers × fixed grid sizes:
 *   small:   20×20  — 40 mazes  (seeds 10001–10040)
 *   medium:  40×40  — 40 mazes  (seeds 20001–20040)
 *   large:   60×60  — 40 mazes  (seeds 30001–30040)
 *   expert:  80×80  — 25 mazes  (seeds 40001–40025)
 *   monster: 100×100 — 15 mazes (seeds 50001–50015)
 *
 * Total: 160 curated library mazes.
 *
 * Each entry stores only the id + seed. The maze grid is generated
 * deterministically at play time (client-side) using anyPortalSide: true
 * and the current GENERATOR_VERSION.
 *
 * Run: npm run generate:library-catalog
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LibraryCatalogEntry, Difficulty } from '../src/types/maze.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../src/data/libraryCatalog.json');

const GROUPS: Array<{
  difficulty: Difficulty;
  width: number;
  height: number;
  count: number;
  seedBase: number;
}> = [
  { difficulty: 'small',   width: 20,  height: 20,  count: 40, seedBase: 10000 },
  { difficulty: 'medium',  width: 40,  height: 40,  count: 40, seedBase: 20000 },
  { difficulty: 'large',   width: 60,  height: 60,  count: 40, seedBase: 30000 },
  { difficulty: 'expert',  width: 80,  height: 80,  count: 25, seedBase: 40000 },
  { difficulty: 'monster', width: 100, height: 100, count: 15, seedBase: 50000 },
];

/**
 * Seed overrides for IDs that scored below 0.85 on the initial audit.
 * Default seed = seedBase + index. Override = seedBase + index + 1000.
 * Re-audit after any change: npm run library:audit
 */
const SEED_OVERRIDES: Record<string, number> = {
  'small-005':   11005,
  'small-006':   11006,
  'small-007':   11007,
  'small-013':   11013,
  'small-032':   12032,
  'medium-018':  21018,
  'medium-028':  21028,
  'medium-032':  22032,
  'large-027':   31027,
  'large-029':   31029,
  'large-037':   31037,
  'expert-011':  41011,
  'expert-016':  42016,
  'expert-022':  41022,
  'monster-014': 51014,
};

function pad(n: number, digits = 3): string {
  return String(n).padStart(digits, '0');
}

const mazes: LibraryCatalogEntry[] = [];

for (const { difficulty, width, height, count, seedBase } of GROUPS) {
  for (let i = 1; i <= count; i++) {
    const id = `${difficulty}-${pad(i)}`;
    mazes.push({
      id,
      difficulty,
      width,
      height,
      seed: SEED_OVERRIDES[id] ?? seedBase + i,
    });
  }
}

const catalog = { version: 3, mazes };
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n');
console.log(`✓ Generated ${mazes.length} library maze entries → ${OUT}`);
