/**
 * Generates src/data/catalog.json — the seed manifest for all pre-made mazes.
 * Run: npm run generate:catalog
 *
 * Three tiers × fixed grid sizes:
 *   small:  20×20  — 60 mazes
 *   medium: 40×40  — 50 mazes
 *   large:  60×60  — 40 mazes
 *
 * Each entry stores only the slug + seed; the actual maze grid is
 * computed deterministically at build time via generateMaze({ seed }).
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MazeCatalogEntry, Difficulty } from '../src/types/maze.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../src/data/catalog.json');

const GROUPS: Array<{ difficulty: Difficulty; w: number; h: number; count: number; seedBase: number }> = [
  { difficulty: 'small',  w: 20, h: 20, count: 60, seedBase: 10000 },
  { difficulty: 'medium', w: 40, h: 40, count: 50, seedBase: 20000 },
  { difficulty: 'large',  w: 60, h: 60, count: 40, seedBase: 30000 },
];

function pad(n: number, digits = 3): string {
  return String(n).padStart(digits, '0');
}

const mazes: MazeCatalogEntry[] = [];

for (const { difficulty, w, h, count, seedBase } of GROUPS) {
  for (let i = 1; i <= count; i++) {
    const slug = `${difficulty}-${w}x${h}-${pad(i)}`;
    const seed = seedBase + (w * 1000) + i;
    mazes.push({ slug, difficulty, width: w, height: h, seed });
  }
}

const catalog = { version: 2, mazes };

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n');
console.log(`✓ Generated ${mazes.length} maze entries → ${OUT}`);
