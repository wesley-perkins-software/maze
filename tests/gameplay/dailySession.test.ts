import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveDailySession,
  loadDailySession,
  clearDailySession,
  DAILY_SESSION_STORAGE_KEY,
  DAILY_SESSION_VERSION,
} from '../../src/lib/gameplay/dailySession';
import type { SaveDailySessionInput } from '../../src/lib/gameplay/dailySession';

const CURRENT_VERSION = 1;
const TODAY = '2026-05-21';
const SEED = 0xabcd1234;

function makeSession(overrides: Partial<SaveDailySessionInput> = {}): SaveDailySessionInput {
  return {
    generatorVersion: CURRENT_VERSION,
    localDate: TODAY,
    maze: {
      width: 60,
      height: 60,
      seed: SEED,
      difficulty: 'large',
      label: 'Large',
      anyPortalSide: true,
    },
    progress: {
      playerPosition: { x: 3, y: 5 },
      elapsedMs: 540_000,
      steps: 2851,
      hintsUsed: 0,
      trail: [0, 1, 2, 60, 61],
      showTrail: false,
      solutionVisible: false,
      status: 'playing',
    },
    ...overrides,
  };
}

// Minimal localStorage shim for Node/Vitest environment.
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveDailySession + loadDailySession', () => {
  it('round-trips a session correctly', () => {
    saveDailySession(makeSession());
    const loaded = loadDailySession(CURRENT_VERSION, TODAY, SEED);

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(DAILY_SESSION_VERSION);
    expect(loaded!.mode).toBe('daily');
    expect(loaded!.localDate).toBe(TODAY);
    expect(loaded!.generatorVersion).toBe(CURRENT_VERSION);
    expect(loaded!.maze.seed).toBe(SEED);
    expect(loaded!.maze.width).toBe(60);
    expect(loaded!.maze.difficulty).toBe('large');
    expect(loaded!.progress.playerPosition).toEqual({ x: 3, y: 5 });
    expect(loaded!.progress.trail).toEqual([0, 1, 2, 60, 61]);
    expect(loaded!.progress.elapsedMs).toBe(540_000);
    expect(loaded!.progress.steps).toBe(2851);
    expect(loaded!.progress.showTrail).toBe(false);
  });

  it('saves a savedAt timestamp close to now', () => {
    const before = Date.now();
    saveDailySession(makeSession());
    const after = Date.now();
    const loaded = loadDailySession(CURRENT_VERSION, TODAY, SEED);
    expect(loaded!.savedAt).toBeGreaterThanOrEqual(before);
    expect(loaded!.savedAt).toBeLessThanOrEqual(after);
  });

  it('sets mode to "daily"', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    expect(raw.mode).toBe('daily');
  });
});

describe('loadDailySession — date validation', () => {
  it('returns null when localDate does not match today', () => {
    saveDailySession(makeSession({ localDate: '2026-05-20' })); // yesterday
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('clears the key when localDate is yesterday', () => {
    saveDailySession(makeSession({ localDate: '2026-05-20' }));
    loadDailySession(CURRENT_VERSION, TODAY, SEED);
    expect(store[DAILY_SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('returns null for a future date', () => {
    saveDailySession(makeSession({ localDate: '2026-05-22' }));
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });
});

describe('loadDailySession — version and seed validation', () => {
  it('returns null when generatorVersion mismatches', () => {
    saveDailySession(makeSession());
    expect(loadDailySession(CURRENT_VERSION + 1, TODAY, SEED)).toBeNull();
  });

  it('clears the key on generatorVersion mismatch', () => {
    saveDailySession(makeSession());
    loadDailySession(CURRENT_VERSION + 1, TODAY, SEED);
    expect(store[DAILY_SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('returns null when seed mismatches', () => {
    saveDailySession(makeSession());
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED + 1)).toBeNull();
  });

  it('clears the key on seed mismatch', () => {
    saveDailySession(makeSession());
    loadDailySession(CURRENT_VERSION, TODAY, SEED + 1);
    expect(store[DAILY_SESSION_STORAGE_KEY]).toBeUndefined();
  });
});

describe('loadDailySession — TTL', () => {
  it('returns null for a session older than 2 days', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    raw.savedAt = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
    store[DAILY_SESSION_STORAGE_KEY] = JSON.stringify(raw);

    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('accepts a session saved just under 2 days ago', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    raw.savedAt = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago
    store[DAILY_SESSION_STORAGE_KEY] = JSON.stringify(raw);

    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).not.toBeNull();
  });
});

describe('loadDailySession — corrupt / missing data', () => {
  it('returns null when nothing is saved', () => {
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    store[DAILY_SESSION_STORAGE_KEY] = 'not-json{{';
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('returns null when version field is wrong', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    raw.version = 99;
    store[DAILY_SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('returns null when mode is "generated" (wrong type stored under daily key)', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    raw.mode = 'generated';
    store[DAILY_SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('returns null when maze field is missing', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    delete raw.maze;
    store[DAILY_SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('returns null when progress field is missing', () => {
    saveDailySession(makeSession());
    const raw = JSON.parse(store[DAILY_SESSION_STORAGE_KEY]);
    delete raw.progress;
    store[DAILY_SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });
});

describe('clearDailySession', () => {
  it('removes the key from localStorage', () => {
    saveDailySession(makeSession());
    expect(store[DAILY_SESSION_STORAGE_KEY]).toBeDefined();
    clearDailySession();
    expect(store[DAILY_SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('is a no-op when nothing is saved', () => {
    expect(() => clearDailySession()).not.toThrow();
  });

  it('returns null from load after clear', () => {
    saveDailySession(makeSession());
    clearDailySession();
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });
});

describe('localStorage unavailable', () => {
  it('save silently fails without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('QuotaExceeded'); },
      setItem: () => { throw new Error('QuotaExceeded'); },
      removeItem: () => { throw new Error('QuotaExceeded'); },
    });
    expect(() => saveDailySession(makeSession())).not.toThrow();
  });

  it('load returns null without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadDailySession(CURRENT_VERSION, TODAY, SEED)).toBeNull();
  });

  it('clear does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('SecurityError'); },
    });
    expect(() => clearDailySession()).not.toThrow();
  });
});
