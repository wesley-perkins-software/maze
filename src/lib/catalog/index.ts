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
 *  2. Same difficulty + adjacent size
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
    // Sort by size similarity
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
 * Returns the smallest maze of the same difficulty whose area exceeds the source,
 * or undefined if the source is already the largest available size.
 */
export function getLargerMaze(source: MazeCatalogEntry): MazeCatalogEntry | undefined {
  const currentArea = source.width * source.height;
  const candidates = getMazesByDifficulty(source.difficulty)
    .filter((m) => m.width * m.height > currentArea);
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => a.width * a.height - b.width * b.height);
  return candidates[0];
}

/**
 * Returns a deterministic "random" maze from the same difficulty, excluding
 * the provided slugs. Uses the source seed for reproducibility so the same
 * maze always suggests the same random pick.
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
 * Prefers medium/adults difficulty for an interesting daily challenge.
 */
export function getDailyMaze(date: Date = new Date()): MazeCatalogEntry {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  // Simple integer hash from date
  const hash = ((y * 366 + m * 31 + d) * 2654435761) >>> 0;
  const pool = catalog.mazes.filter(
    (e) => e.difficulty === 'medium' || e.difficulty === 'adults',
  );
  return pool[hash % pool.length];
}

/**
 * Returns a small set of featured mazes for the homepage.
 * One per difficulty tier, chosen to be representative sizes.
 */
export function getFeaturedMazes(): MazeCatalogEntry[] {
  const picks: Array<{ difficulty: Difficulty; preferredSize: string }> = [
    { difficulty: 'kids',   preferredSize: '6x6'  },
    { difficulty: 'easy',   preferredSize: '8x8'  },
    { difficulty: 'medium', preferredSize: '10x10' },
    { difficulty: 'hard',   preferredSize: '15x15' },
    { difficulty: 'adults', preferredSize: '20x20' },
  ];

  return picks.map(({ difficulty, preferredSize }) => {
    const [pw, ph] = preferredSize.split('x').map(Number);
    const group = getMazesByDifficulty(difficulty);
    return (
      group.find((m) => m.width === pw && m.height === ph) ?? group[0]
    );
  }).filter(Boolean) as MazeCatalogEntry[];
}
