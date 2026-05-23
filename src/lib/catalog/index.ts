import type { MazeCatalogEntry, Difficulty } from '../../types/maze';
import rawCatalog from '../../data/catalog.json';

const catalog = rawCatalog as { version: number; mazes: MazeCatalogEntry[] };

export function getAllMazes(): MazeCatalogEntry[] {
  return catalog.mazes;
}

export function getMazeBySlug(slug: string): MazeCatalogEntry | undefined {
  return catalog.mazes.find((m) => m.slug === slug);
}

export function getMazesByDifficulty(difficulty: Difficulty): MazeCatalogEntry[] {
  return catalog.mazes.filter((m) => m.difficulty === difficulty);
}

/**
 * Returns up to `limit` mazes related to a given maze:
 *  1. Same difficulty + same size (different slugs)
 *  2. Same difficulty (any size)
 * Excludes the source maze itself.
 */
export function getRelatedMazes(source: MazeCatalogEntry, limit = 6): MazeCatalogEntry[] {
  const all = getMazesByDifficulty(source.difficulty).filter(
    (m) => m.slug !== source.slug,
  );

  const sameSize = all.filter(
    (m) => m.width === source.width && m.height === source.height,
  );

  const related = [...sameSize];

  if (related.length < limit) {
    const otherSizes = all.filter(
      (m) => m.width !== source.width || m.height !== source.height,
    );
    otherSizes.sort((a, b) => {
      const aDist = Math.abs(a.width - source.width) + Math.abs(a.height - source.height);
      const bDist = Math.abs(b.width - source.width) + Math.abs(b.height - source.height);
      return aDist - bDist;
    });
    related.push(...otherSizes.slice(0, limit - related.length));
  }

  return related.slice(0, limit);
}

/**
 * Returns the next maze in catalog order within the same difficulty,
 * wrapping around at the end.
 */
export function getNextMaze(source: MazeCatalogEntry): MazeCatalogEntry | undefined {
  const group = getMazesByDifficulty(source.difficulty);
  const idx = group.findIndex((m) => m.slug === source.slug);
  if (idx === -1) return undefined;
  return group[(idx + 1) % group.length];
}

/**
 * Returns the previous maze in catalog order within the same difficulty.
 */
export function getPrevMaze(source: MazeCatalogEntry): MazeCatalogEntry | undefined {
  const group = getMazesByDifficulty(source.difficulty);
  const idx = group.findIndex((m) => m.slug === source.slug);
  if (idx === -1) return undefined;
  return group[(idx - 1 + group.length) % group.length];
}

/**
 * Returns the next tier up from the given maze, or undefined if already large.
 */
export function getLargerMaze(source: MazeCatalogEntry): MazeCatalogEntry | undefined {
  const nextTier: Record<Difficulty, Difficulty | null> = {
    small:   'medium',
    medium:  'large',
    large:   'expert',
    expert:  'monster',
    monster: null,
  };
  const next = nextTier[source.difficulty];
  if (!next) return undefined;
  const group = getMazesByDifficulty(next);
  return group[0];
}

/**
 * Returns a deterministic "random" maze from the same difficulty, excluding
 * the provided slugs. Uses the source seed for reproducibility.
 */
export function getRandomMazePick(
  source: MazeCatalogEntry,
  exclude: string[],
): MazeCatalogEntry {
  const pool = getMazesByDifficulty(source.difficulty).filter(
    (m) => !exclude.includes(m.slug),
  );
  return pool[source.seed % pool.length] ?? pool[0];
}

/**
 * Returns a maze for a given date — deterministic, changes daily.
 * Uses medium mazes for a balanced daily challenge.
 */
export function getDailyMaze(date: Date = new Date()): MazeCatalogEntry {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const hash = ((y * 366 + m * 31 + d) * 2654435761) >>> 0;
  const pool = getMazesByDifficulty('medium');
  return pool[hash % pool.length];
}

/**
 * Derives a 32-bit PRNG seed from a UTC date string "YYYY-MM-DD".
 * Used by the client-side Maze of the Day to generate the same maze for
 * all users on the same calendar day regardless of timezone.
 */
export function dateToSeed(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ((y * 366 + m * 31 + d) * 2654435761) >>> 0;
}

/**
 * Returns a small set of featured mazes for the homepage — one per tier.
 */
export function getFeaturedMazes(): MazeCatalogEntry[] {
  const tiers: Difficulty[] = ['small', 'medium', 'large'];
  return tiers.map((tier) => {
    const group = getMazesByDifficulty(tier);
    return group[0];
  }).filter(Boolean) as MazeCatalogEntry[];
}
