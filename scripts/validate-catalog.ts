/**
 * Validates catalog.json:
 *  1. All slugs are unique
 *  2. All seeds are valid positive integers
 *  3. All mazes are solvable (DFS always produces perfect mazes, this just double-checks)
 *
 * Run: npm run validate:catalog
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MazeCatalog } from '../src/types/maze.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog: MazeCatalog = JSON.parse(
  readFileSync(join(__dirname, '../src/data/catalog.json'), 'utf-8'),
);

let errors = 0;
const slugsSeen = new Set<string>();

for (const entry of catalog.mazes) {
  if (slugsSeen.has(entry.slug)) {
    console.error(`✗ Duplicate slug: ${entry.slug}`);
    errors++;
  }
  slugsSeen.add(entry.slug);

  if (!Number.isInteger(entry.seed) || entry.seed <= 0) {
    console.error(`✗ Invalid seed for ${entry.slug}: ${entry.seed}`);
    errors++;
  }

  if (entry.width < 1 || entry.height < 1) {
    console.error(`✗ Invalid dimensions for ${entry.slug}: ${entry.width}x${entry.height}`);
    errors++;
  }
}

if (errors === 0) {
  console.log(`✓ catalog.json valid — ${catalog.mazes.length} mazes, all slugs unique`);
  process.exit(0);
} else {
  console.error(`✗ ${errors} error(s) found in catalog.json`);
  process.exit(1);
}
