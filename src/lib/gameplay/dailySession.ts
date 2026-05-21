import type { Difficulty } from '../../types/maze.js';
import type { SessionProgress } from './session.js';

export const DAILY_SESSION_STORAGE_KEY = 'mazethis.dailyMaze.activeSession';
export const DAILY_SESSION_VERSION = 1;
// 2-day TTL — daily sessions are keyed by date and would be rejected by date
// check anyway, but this prevents indefinite accumulation in edge cases.
const DAILY_SESSION_TTL_MS = 2 * 24 * 60 * 60 * 1000;

export interface DailySessionMaze {
  width: number;
  height: number;
  seed: number;
  difficulty: Difficulty;
  label: string;
  anyPortalSide: true;
}

export interface DailyMazeSession {
  version: 1;
  mode: 'daily';
  generatorVersion: number;
  savedAt: number;
  localDate: string; // 'YYYY-MM-DD' — must match today's local date to restore
  maze: DailySessionMaze;
  progress: SessionProgress;
}

export type SaveDailySessionInput = Omit<DailyMazeSession, 'version' | 'mode' | 'savedAt'>;

export function saveDailySession(input: SaveDailySessionInput): void {
  try {
    const session: DailyMazeSession = {
      ...input,
      version: 1,
      mode: 'daily',
      savedAt: Date.now(),
    };
    localStorage.setItem(DAILY_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Silently ignore quota errors or private-browsing restrictions.
  }
}

export function loadDailySession(
  currentGeneratorVersion: number,
  todayLocalDate: string,
  expectedSeed: number,
): DailyMazeSession | null {
  try {
    const raw = localStorage.getItem(DAILY_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as Partial<DailyMazeSession>;

    if (
      session.version !== 1 ||
      session.mode !== 'daily' ||
      session.localDate !== todayLocalDate ||
      session.generatorVersion !== currentGeneratorVersion ||
      typeof session.savedAt !== 'number' ||
      Date.now() - session.savedAt > DAILY_SESSION_TTL_MS ||
      !session.maze ||
      session.maze.seed !== expectedSeed ||
      !session.progress
    ) {
      // Stale, incompatible, wrong date, or corrupt — discard silently.
      localStorage.removeItem(DAILY_SESSION_STORAGE_KEY);
      return null;
    }

    return session as DailyMazeSession;
  } catch {
    return null;
  }
}

export function clearDailySession(): void {
  try {
    localStorage.removeItem(DAILY_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
