import type { Difficulty } from '../../types/maze.js';
import type { MazeData } from '../../types/maze.js';
import type { Point } from '../../types/maze.js';
import type { GameStatus } from './types.js';

export const SESSION_STORAGE_KEY = 'mazethis.generatedMaze.activeSession';
export const SESSION_VERSION = 1;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionMaze {
  width: number;
  height: number;
  seed: number;
  difficulty: Difficulty;
  label: string;
  anyPortalSide: true;
}

export interface SessionProgress {
  playerPosition: Point;
  elapsedMs: number;
  steps: number;
  hintsUsed: number;
  trail: number[];
  showTrail: boolean;
  solutionVisible: boolean;
  // status is saved so 'idle' sessions restore correctly (no auto-pause)
  status: Exclude<GameStatus, 'solved'>;
}

export interface GeneratedMazeSession {
  version: 1;
  mode: 'generated';
  generatorVersion: number;
  savedAt: number;
  maze: SessionMaze;
  progress: SessionProgress;
}

export type SaveSessionInput = Omit<GeneratedMazeSession, 'version' | 'mode' | 'savedAt'>;

export function saveGeneratedSession(input: SaveSessionInput): void {
  try {
    const session: GeneratedMazeSession = {
      ...input,
      version: 1,
      mode: 'generated',
      savedAt: Date.now(),
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Silently ignore quota errors or private-browsing restrictions.
  }
}

export function loadGeneratedSession(currentGeneratorVersion: number): GeneratedMazeSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as Partial<GeneratedMazeSession>;

    if (
      session.version !== 1 ||
      session.mode !== 'generated' ||
      session.generatorVersion !== currentGeneratorVersion ||
      typeof session.savedAt !== 'number' ||
      Date.now() - session.savedAt > SESSION_TTL_MS ||
      !session.maze ||
      !session.progress
    ) {
      // Stale, incompatible, or corrupt — discard silently.
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session as GeneratedMazeSession;
  } catch {
    return null;
  }
}

export function clearGeneratedSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isSameGeneratedMazeIdentity(
  session: GeneratedMazeSession,
  previewMaze: MazeData,
  currentGeneratorVersion: number,
): boolean {
  return (
    session.generatorVersion === currentGeneratorVersion
    && session.maze.seed === previewMaze.seed
    && session.maze.width === previewMaze.width
    && session.maze.height === previewMaze.height
    && session.maze.difficulty === previewMaze.difficulty
    && session.maze.label === previewMaze.label
  );
}
