const STREAK_KEY = 'mazepuzzles.dailyMaze.streak';

export interface StreakData {
  current: number;
  longest: number;
  lastCompletedDate: string; // 'YYYY-MM-DD'
}

function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function loadStreak(): StreakData | null {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StreakData>;
    if (
      typeof parsed.current !== 'number' ||
      typeof parsed.longest !== 'number' ||
      typeof parsed.lastCompletedDate !== 'string'
    ) return null;
    return parsed as StreakData;
  } catch {
    return null;
  }
}

/**
 * Records a solve for the given local date and returns the updated streak.
 * Idempotent: calling again on the same date returns the same result.
 */
export function recordSolve(today: string): StreakData {
  const prev = loadStreak();

  let current: number;
  if (!prev) {
    current = 1;
  } else if (prev.lastCompletedDate === today) {
    // Already recorded today — no change
    return prev;
  } else if (prev.lastCompletedDate === dayBefore(today)) {
    current = prev.current + 1;
  } else {
    current = 1;
  }

  const longest = prev ? Math.max(prev.longest, current) : current;
  const streak: StreakData = { current, longest, lastCompletedDate: today };

  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {
    // localStorage unavailable — return computed value without persisting
  }

  return streak;
}
