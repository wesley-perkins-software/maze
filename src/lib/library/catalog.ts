import type { LibraryCatalogEntry, LibraryCatalog, Difficulty } from '../../types/maze.js';
import rawCatalog from '../../data/libraryCatalog.json';

const catalog = rawCatalog as LibraryCatalog;

export function getAllLibraryMazes(): LibraryCatalogEntry[] {
  return catalog.mazes;
}

export function getLibraryMazeById(id: string): LibraryCatalogEntry | undefined {
  return catalog.mazes.find((m) => m.id === id);
}

export function getLibraryMazesByDifficulty(difficulty: Difficulty): LibraryCatalogEntry[] {
  return catalog.mazes.filter((m) => m.difficulty === difficulty);
}

const DIFFICULTY_ORDER: Difficulty[] = ['small', 'medium', 'large', 'expert', 'monster'];

export function getNextLibraryMaze(id: string): LibraryCatalogEntry | undefined {
  const entry = getLibraryMazeById(id);
  if (!entry) return undefined;
  const group = getLibraryMazesByDifficulty(entry.difficulty);
  const idx = group.findIndex((m) => m.id === id);
  if (idx === -1) return undefined;
  // Within the tier, advance normally
  if (idx < group.length - 1) return group[idx + 1];
  // At the end of the tier, advance to the first maze of the next tier
  const tierIdx = DIFFICULTY_ORDER.indexOf(entry.difficulty);
  if (tierIdx === -1 || tierIdx === DIFFICULTY_ORDER.length - 1) return undefined;
  const nextTier = DIFFICULTY_ORDER[tierIdx + 1]!;
  return getLibraryMazesByDifficulty(nextTier)[0];
}

export function getPrevLibraryMaze(id: string): LibraryCatalogEntry | undefined {
  const entry = getLibraryMazeById(id);
  if (!entry) return undefined;
  const group = getLibraryMazesByDifficulty(entry.difficulty);
  const idx = group.findIndex((m) => m.id === id);
  if (idx === -1) return undefined;
  return group[(idx - 1 + group.length) % group.length];
}

export function getLibraryCatalogVersion(): number {
  return catalog.version;
}
