import type { SessionProgress } from '../gameplay/session.js';

export type { SessionProgress };

const SESSION_VERSION = 1;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function storageKey(mazeId: string): string {
  return `mazepuzzles.library.session.${mazeId}`;
}

export interface LibraryMazeSession {
  version: 1;
  mode: 'library';
  mazeId: string;
  generatorVersion: number;
  savedAt: number;
  progress: SessionProgress;
}

export function saveLibrarySession(
  mazeId: string,
  generatorVersion: number,
  progress: SessionProgress,
): void {
  try {
    const session: LibraryMazeSession = {
      version: 1,
      mode: 'library',
      mazeId,
      generatorVersion,
      savedAt: Date.now(),
      progress,
    };
    localStorage.setItem(storageKey(mazeId), JSON.stringify(session));
  } catch {
    // Silently ignore quota errors or private-browsing restrictions.
  }
}

export function loadLibrarySession(
  mazeId: string,
  generatorVersion: number,
): LibraryMazeSession | null {
  try {
    const raw = localStorage.getItem(storageKey(mazeId));
    if (!raw) return null;

    const session = JSON.parse(raw) as Partial<LibraryMazeSession>;

    if (
      session.version !== SESSION_VERSION ||
      session.mode !== 'library' ||
      session.mazeId !== mazeId ||
      session.generatorVersion !== generatorVersion ||
      typeof session.savedAt !== 'number' ||
      Date.now() - session.savedAt > SESSION_TTL_MS ||
      !session.progress
    ) {
      // Stale, incompatible, or corrupt — discard silently.
      localStorage.removeItem(storageKey(mazeId));
      return null;
    }

    return session as LibraryMazeSession;
  } catch {
    return null;
  }
}

export function clearLibrarySession(mazeId: string): void {
  try {
    localStorage.removeItem(storageKey(mazeId));
  } catch {
    // ignore
  }
}
