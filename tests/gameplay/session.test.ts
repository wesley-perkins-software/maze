import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveGeneratedSession,
  loadGeneratedSession,
  clearGeneratedSession,
  isSameGeneratedMazeIdentity,
  SESSION_STORAGE_KEY,
  SESSION_VERSION,
} from '../../src/lib/gameplay/session';
import type { SaveSessionInput } from '../../src/lib/gameplay/session';

const CURRENT_VERSION = 1;

function makeSession(overrides: Partial<SaveSessionInput> = {}): SaveSessionInput {
  return {
    generatorVersion: CURRENT_VERSION,
    maze: {
      width: 100,
      height: 100,
      seed: 0xdeadbeef,
      difficulty: 'large',
      label: 'Monster',
      anyPortalSide: true,
    },
    progress: {
      playerPosition: { x: 5, y: 7 },
      elapsedMs: 127_000,
      steps: 423,
      hintsUsed: 1,
      trail: [0, 1, 2, 3, 100],
      showTrail: true,
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

describe('saveGeneratedSession + loadGeneratedSession', () => {
  it('round-trips a session correctly', () => {
    const input = makeSession();
    saveGeneratedSession(input);
    const loaded = loadGeneratedSession(CURRENT_VERSION);

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SESSION_VERSION);
    expect(loaded!.mode).toBe('generated');
    expect(loaded!.generatorVersion).toBe(CURRENT_VERSION);
    expect(loaded!.maze.width).toBe(100);
    expect(loaded!.maze.seed).toBe(0xdeadbeef);
    expect(loaded!.progress.playerPosition).toEqual({ x: 5, y: 7 });
    expect(loaded!.progress.trail).toEqual([0, 1, 2, 3, 100]);
    expect(loaded!.progress.elapsedMs).toBe(127_000);
    expect(loaded!.progress.showTrail).toBe(true);
  });

  it('saves a savedAt timestamp close to now', () => {
    const before = Date.now();
    saveGeneratedSession(makeSession());
    const after = Date.now();
    const loaded = loadGeneratedSession(CURRENT_VERSION);
    expect(loaded!.savedAt).toBeGreaterThanOrEqual(before);
    expect(loaded!.savedAt).toBeLessThanOrEqual(after);
  });
});

describe('loadGeneratedSession', () => {
  it('returns null when nothing is saved', () => {
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });

  it('returns null when generatorVersion mismatches', () => {
    saveGeneratedSession(makeSession({ generatorVersion: CURRENT_VERSION }));
    // Caller passes bumped version
    expect(loadGeneratedSession(CURRENT_VERSION + 1)).toBeNull();
  });

  it('clears the key when generatorVersion mismatches', () => {
    saveGeneratedSession(makeSession());
    loadGeneratedSession(CURRENT_VERSION + 1);
    expect(store[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('returns null for an expired session (> 7 days old)', () => {
    saveGeneratedSession(makeSession());
    const raw = JSON.parse(store[SESSION_STORAGE_KEY]);
    raw.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    store[SESSION_STORAGE_KEY] = JSON.stringify(raw);

    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });

  it('accepts a session saved just under 7 days ago', () => {
    saveGeneratedSession(makeSession());
    const raw = JSON.parse(store[SESSION_STORAGE_KEY]);
    raw.savedAt = Date.now() - 6 * 24 * 60 * 60 * 1000; // 6 days ago
    store[SESSION_STORAGE_KEY] = JSON.stringify(raw);

    expect(loadGeneratedSession(CURRENT_VERSION)).not.toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    store[SESSION_STORAGE_KEY] = 'not-json{{';
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });

  it('returns null when version field is wrong', () => {
    saveGeneratedSession(makeSession());
    const raw = JSON.parse(store[SESSION_STORAGE_KEY]);
    raw.version = 99;
    store[SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });

  it('returns null when mode field is wrong', () => {
    saveGeneratedSession(makeSession());
    const raw = JSON.parse(store[SESSION_STORAGE_KEY]);
    raw.mode = 'daily';
    store[SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });

  it('returns null when maze field is missing', () => {
    saveGeneratedSession(makeSession());
    const raw = JSON.parse(store[SESSION_STORAGE_KEY]);
    delete raw.maze;
    store[SESSION_STORAGE_KEY] = JSON.stringify(raw);
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });
});

describe('clearGeneratedSession', () => {
  it('removes the key from localStorage', () => {
    saveGeneratedSession(makeSession());
    expect(store[SESSION_STORAGE_KEY]).toBeDefined();
    clearGeneratedSession();
    expect(store[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('is a no-op when nothing is saved', () => {
    expect(() => clearGeneratedSession()).not.toThrow();
  });

  it('returns null from load after clear', () => {
    saveGeneratedSession(makeSession());
    clearGeneratedSession();
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });
});

describe('localStorage unavailable', () => {
  it('save silently fails without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('QuotaExceeded'); },
      setItem: () => { throw new Error('QuotaExceeded'); },
      removeItem: () => { throw new Error('QuotaExceeded'); },
    });
    expect(() => saveGeneratedSession(makeSession())).not.toThrow();
  });

  it('load returns null without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadGeneratedSession(CURRENT_VERSION)).toBeNull();
  });

  it('clear does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('SecurityError'); },
    });
    expect(() => clearGeneratedSession()).not.toThrow();
  });
});

describe('isSameGeneratedMazeIdentity', () => {
  it('returns true when seed, dimensions, difficulty, and generator version all match', () => {
    const saved = {
      ...makeSession(),
      maze: {
        width: 60,
        height: 60,
        seed: 12345,
        difficulty: 'large' as const,
        label: 'Large',
        anyPortalSide: true as const,
      },
    };
    saveGeneratedSession(saved);
    const loaded = loadGeneratedSession(CURRENT_VERSION)!;
    const previewMaze = {
      width: 60,
      height: 60,
      seed: 12345,
      difficulty: 'large',
    };

    expect(isSameGeneratedMazeIdentity(loaded, previewMaze, CURRENT_VERSION)).toBe(true);
  });

  it('returns false when any identity field differs', () => {
    const loaded = {
      ...makeSession(),
      version: 1 as const,
      mode: 'generated' as const,
      savedAt: Date.now(),
    };
    const previewMaze = {
      width: loaded.maze.width,
      height: loaded.maze.height,
      seed: loaded.maze.seed + 1,
      difficulty: loaded.maze.difficulty,
    };

    expect(isSameGeneratedMazeIdentity(loaded, previewMaze, CURRENT_VERSION)).toBe(false);
    expect(isSameGeneratedMazeIdentity(loaded, { ...previewMaze, seed: loaded.maze.seed }, CURRENT_VERSION + 1)).toBe(false);
  });
});
