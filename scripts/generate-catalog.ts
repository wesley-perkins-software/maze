/**
 * Generates src/data/catalog.json — the seed manifest for all 420 mazes.
 * Run: npm run generate:catalog
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

type SizeGroup = { w: number; h: number; count: number };

const GROUPS: Array<{ difficulty: Difficulty; sizes: SizeGroup[]; seedBase: number }> = [
  {
    difficulty: 'easy',
    seedBase: 10000,
    sizes: [
      { w: 5,  h: 5,  count: 30 },
      { w: 8,  h: 8,  count: 30 },
      { w: 10, h: 10, count: 30 },
    ],
  },
  {
    difficulty: 'medium',
    seedBase: 20000,
    sizes: [
      { w: 10, h: 10, count: 30 },
      { w: 12, h: 12, count: 30 },
      { w: 15, h: 15, count: 30 },
    ],
  },
  {
    difficulty: 'hard',
    seedBase: 30000,
    sizes: [
      { w: 15, h: 15, count: 25 },
      { w: 20, h: 20, count: 25 },
      { w: 25, h: 25, count: 25 },
    ],
  },
  {
    difficulty: 'kids',
    seedBase: 40000,
    sizes: [
      { w: 5, h: 5, count: 30 },
      { w: 6, h: 6, count: 30 },
      { w: 8, h: 8, count: 30 },
    ],
  },
  {
    difficulty: 'adults',
    seedBase: 50000,
    sizes: [
      { w: 15, h: 15, count: 25 },
      { w: 20, h: 20, count: 25 },
      { w: 25, h: 25, count: 25 },
    ],
  },
];

function pad(n: number, digits = 3): string {
  return String(n).padStart(digits, '0');
}

const mazes: MazeCatalogEntry[] = [];

for (const group of GROUPS) {
  let globalIndex = 1;
  for (const { w, h, count } of group.sizes) {
    for (let i = 1; i <= count; i++) {
      const slug = `${group.difficulty}-${w}x${h}-${pad(i)}`;
      const seed = group.seedBase + (w * 1000) + i;
      mazes.push({
        slug,
        difficulty: group.difficulty,
        width: w,
        height: h,
        seed,
      });
      globalIndex++;
    }
  }
}

const catalog = { version: 1, mazes };

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n');
console.log(`✓ Generated ${mazes.length} maze entries → ${OUT}`);
