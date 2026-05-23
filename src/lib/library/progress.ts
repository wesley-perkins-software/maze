import type { Difficulty } from '../../types/maze.js';

const LIBRARY_PROGRESS_KEY = 'mazethis.library.progress';
const LIBRARY_PROGRESS_VERSION = 1;

interface LibraryProgress {
  version: 1;
  completedMazeIds: string[];
}

function readProgress(): LibraryProgress {
  try {
    const raw = localStorage.getItem(LIBRARY_PROGRESS_KEY);
    if (!raw) return { version: 1, completedMazeIds: [] };
    const parsed = JSON.parse(raw) as Partial<LibraryProgress>;
    if (parsed.version !== LIBRARY_PROGRESS_VERSION || !Array.isArray(parsed.completedMazeIds)) {
      return { version: 1, completedMazeIds: [] };
    }
    return parsed as LibraryProgress;
  } catch {
    return { version: 1, completedMazeIds: [] };
  }
}

function writeProgress(progress: LibraryProgress): void {
  try {
    localStorage.setItem(LIBRARY_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Silently ignore quota errors or private-browsing restrictions.
  }
}

export function getLibraryProgress(): LibraryProgress {
  return readProgress();
}

export function markLibraryMazeComplete(id: string): void {
  const progress = readProgress();
  if (!progress.completedMazeIds.includes(id)) {
    progress.completedMazeIds.push(id);
    writeProgress(progress);
  }
}

export function isLibraryMazeComplete(id: string): boolean {
  return readProgress().completedMazeIds.includes(id);
}

export function getCompletedCountByDifficulty(difficulty: Difficulty): number {
  const { completedMazeIds } = readProgress();
  return completedMazeIds.filter((id) => id.startsWith(`${difficulty}-`)).length;
}

export function getTotalCompletedCount(): number {
  return readProgress().completedMazeIds.length;
}

/**
 * Returns the id of the first uncompleted maze in the given difficulty tier,
 * or null if all are complete. Requires the full ordered list of IDs for the tier.
 */
export function getNextUncompletedId(
  difficulty: Difficulty,
  allIdsInTier: string[],
): string | null {
  const { completedMazeIds } = readProgress();
  return allIdsInTier.find((id) => !completedMazeIds.includes(id)) ?? null;
}
