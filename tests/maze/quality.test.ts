import { describe, it, expect } from 'vitest';
import { scoreMetrics, computeFullScore, computeLightScore, refValues, sameSideDepthGate } from '../../src/lib/maze/quality';
import type { SolutionMetrics, Side } from '../../src/lib/maze/quality';
import { generateMaze } from '../../src/lib/maze/generator';

// ── Pure function unit tests ──────────────────────────────────────────────────

describe('refValues', () => {
  it('returns increasing refPath with size', () => {
    const s = refValues(400);
    const m = refValues(1600);
    const l = refValues(3600);
    expect(m.refPath).toBeGreaterThan(s.refPath);
    expect(l.refPath).toBeGreaterThan(m.refPath);
  });

  it('returns increasing refTurns with size', () => {
    const s = refValues(400);
    const m = refValues(1600);
    expect(m.refTurns).toBeGreaterThan(s.refTurns);
  });

  it('≤1000 bucket is distinct from ≤400 and ≤1600 buckets', () => {
    const r400  = refValues(400);
    const r1000 = refValues(1000);
    const r1600 = refValues(1600);
    expect(r1000.refPath).toBeGreaterThan(r400.refPath);
    expect(r1600.refPath).toBeGreaterThan(r1000.refPath);
    expect(r1000.refTurns).toBeGreaterThan(r400.refTurns);
    expect(r1600.refTurns).toBeGreaterThan(r1000.refTurns);
  });

  it('refValues are monotonically increasing across all tiers', () => {
    const tiers = [400, 1000, 1600, 2400, 3600, 6400, 10000];
    for (let i = 1; i < tiers.length; i++) {
      const prev = refValues(tiers[i - 1]);
      const curr = refValues(tiers[i]);
      expect(curr.refPath).toBeGreaterThan(prev.refPath);
      expect(curr.refTurns).toBeGreaterThan(prev.refTurns);
    }
  });

  it('turnScore for a median 40×40 maze is not capped at 1.5×', () => {
    // With new refs, p50 turns≈407 / refTurns=375 ≈ 1.085 — well below the 1.5× cap.
    const { refTurns } = refValues(1600); // ≤ 40×40 bucket
    const observedP50Turns = 407;
    const ratio = observedP50Turns / refTurns;
    expect(ratio).toBeGreaterThan(1.0);  // median maze scores above reference
    expect(ratio).toBeLessThan(1.5);     // but is not permanently capped
  });

  it('turnScore for a median 100×100 maze is not capped at 1.5×', () => {
    const { refTurns } = refValues(10000); // 100×100+ bucket
    const observedP50Turns = 2027;
    const ratio = observedP50Turns / refTurns;
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.5);
  });
});

describe('scoreMetrics', () => {
  it('returns zero metrics for paths shorter than 2', () => {
    const m = scoreMetrics([], 10, 10);
    expect(m.pathLength).toBe(0);
    expect(m.turnCount).toBe(0);
    expect(m.zoneCount).toBe(0);

    const m1 = scoreMetrics([0], 10, 10);
    expect(m1.pathLength).toBe(1);
    expect(m1.turnCount).toBe(0);
  });

  it('counts zero turns for a straight horizontal path', () => {
    // Path: (0,0) → (1,0) → (2,0) → (3,0) = indices 0,1,2,3 in a 10-wide grid
    const sol = [0, 1, 2, 3];
    const m = scoreMetrics(sol, 10, 10);
    expect(m.turnCount).toBe(0);
  });

  it('counts one turn for an L-shaped path', () => {
    // Right then down: (0,0)→(1,0)→(2,0) then (2,0)→(2,1) — one turn
    const width = 10;
    const sol = [0, 1, 2, 2 + width];
    const m = scoreMetrics(sol, width, 10);
    expect(m.turnCount).toBe(1);
  });

  it('counts turns correctly for a zigzag path', () => {
    // Right, Down, Right, Down — 3 turns
    const width = 10;
    const sol = [0, 1, 1 + width, 2 + width, 2 + 2 * width];
    const m = scoreMetrics(sol, width, 10);
    expect(m.turnCount).toBe(3);
  });

  it('zone count is between 1 and 16', () => {
    // A path of 5 cells near top-left corner
    const sol = [0, 1, 2, 10, 11];
    const m = scoreMetrics(sol, 20, 20);
    expect(m.zoneCount).toBeGreaterThanOrEqual(1);
    expect(m.zoneCount).toBeLessThanOrEqual(16);
  });

  it('borderFraction is 1 for a single perimeter cell', () => {
    const m = scoreMetrics([0, 1], 20, 20);
    // Both cells x=0 and x=1 are ≤1, so near-border
    expect(m.borderFraction).toBe(1);
  });

  it('borderFraction is 0 for interior cells only', () => {
    // Interior cells: x=5,y=5 and x=6,y=5 in a 20×20 grid
    const width = 20;
    const sol = [5 * width + 5, 5 * width + 6, 5 * width + 7];
    const m = scoreMetrics(sol, width, 20);
    expect(m.borderFraction).toBe(0);
  });

  it('produces all 16 zones for a path that visits every zone', () => {
    // Build a path that passes through the center of each 4×4 zone in a 20×20 grid
    // Zone centers at x = 2,7,12,17 and y = 2,7,12,17
    const width = 20;
    const zoneCenters: number[] = [];
    for (let zy = 0; zy < 4; zy++) {
      for (let zx = 0; zx < 4; zx++) {
        const x = Math.floor((zx + 0.5) * (width / 4));
        const y = Math.floor((zy + 0.5) * (width / 4));
        zoneCenters.push(y * width + x);
      }
    }
    const m = scoreMetrics(zoneCenters, width, width);
    expect(m.zoneCount).toBe(16);
  });

  it('minSpan is 0 for a path shorter than 2', () => {
    expect(scoreMetrics([], 20, 20).minSpan).toBe(0);
    expect(scoreMetrics([10], 20, 20).minSpan).toBe(0);
  });

  it('minSpan is 0 for a straight horizontal path (no y spread)', () => {
    // (0,0)→(5,0)→(10,0): ySpan = 0, so minSpan = 0
    const width = 20;
    const sol = [0, 5, 10];
    const m = scoreMetrics(sol, width, 20);
    expect(m.minSpan).toBe(0);
  });

  it('minSpan equals the bottleneck axis span', () => {
    // Path: (0,0) and (19,9) in a 20×20 grid
    // xSpan = 19/19 = 1.0, ySpan = 9/19 ≈ 0.474 → minSpan ≈ 0.474
    const width = 20;
    const sol = [0, 9 * width + 19]; // (0,0) and (19,9)
    const m = scoreMetrics(sol, width, 20);
    expect(m.minSpan).toBeCloseTo(9 / 19, 5);
  });

  it('minSpan is 1 for a path reaching all four corners', () => {
    const width = 20;
    const sol = [
      0,                        // (0,0)
      19,                       // (19,0)
      19 * width + 0,           // (0,19)
      19 * width + 19,          // (19,19)
    ];
    const m = scoreMetrics(sol, width, 20);
    expect(m.minSpan).toBe(1);
  });
});

describe('computeFullScore', () => {
  it('returns a positive value for a decent solution', () => {
    const metrics: SolutionMetrics = { pathLength: 88, turnCount: 55, zoneCount: 10, borderFraction: 0.1, minSpan: 0.8 };
    const score = computeFullScore(metrics, 400);
    expect(score).toBeGreaterThan(0);
  });

  it('returns higher score for better zone coverage', () => {
    const base: SolutionMetrics = { pathLength: 88, turnCount: 55, zoneCount: 8, borderFraction: 0.1, minSpan: 0.7 };
    const better: SolutionMetrics = { ...base, zoneCount: 14 };
    expect(computeFullScore(better, 400)).toBeGreaterThan(computeFullScore(base, 400));
  });

  it('returns higher score for more turns', () => {
    const base: SolutionMetrics = { pathLength: 88, turnCount: 30, zoneCount: 8, borderFraction: 0.1, minSpan: 0.7 };
    const better: SolutionMetrics = { ...base, turnCount: 80 };
    expect(computeFullScore(better, 400)).toBeGreaterThan(computeFullScore(base, 400));
  });

  it('returns higher score for greater minSpan', () => {
    const base: SolutionMetrics = { pathLength: 88, turnCount: 55, zoneCount: 8, borderFraction: 0.1, minSpan: 0.3 };
    const better: SolutionMetrics = { ...base, minSpan: 0.9 };
    expect(computeFullScore(better, 400)).toBeGreaterThan(computeFullScore(base, 400));
  });

  it('penalises high border fraction', () => {
    const base: SolutionMetrics = { pathLength: 88, turnCount: 55, zoneCount: 8, borderFraction: 0.1, minSpan: 0.7 };
    const worse: SolutionMetrics = { ...base, borderFraction: 0.9 };
    expect(computeFullScore(worse, 400)).toBeLessThan(computeFullScore(base, 400));
  });

  it('never returns a negative value', () => {
    const worst: SolutionMetrics = { pathLength: 1, turnCount: 0, zoneCount: 0, borderFraction: 1, minSpan: 0 };
    expect(computeFullScore(worst, 400)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeLightScore', () => {
  it('returns higher score for longer path', () => {
    const short: SolutionMetrics = { pathLength: 50, turnCount: 40, zoneCount: 6, borderFraction: 0.1, minSpan: 0.6 };
    const long:  SolutionMetrics = { ...short, pathLength: 100 };
    expect(computeLightScore(long, 400)).toBeGreaterThan(computeLightScore(short, 400));
  });

  it('returns a positive value for a valid path', () => {
    const m: SolutionMetrics = { pathLength: 88, turnCount: 55, zoneCount: 8, borderFraction: 0.2, minSpan: 0.7 };
    expect(computeLightScore(m, 400)).toBeGreaterThan(0);
  });

  it('returns higher score for greater minSpan', () => {
    const base: SolutionMetrics = { pathLength: 88, turnCount: 55, zoneCount: 8, borderFraction: 0.1, minSpan: 0.3 };
    const better: SolutionMetrics = { ...base, minSpan: 0.9 };
    expect(computeLightScore(better, 400)).toBeGreaterThan(computeLightScore(base, 400));
  });
});

describe('sameSideDepthGate', () => {
  it('returns false when path stays near the top (top/bottom same-side)', () => {
    // Path entirely in top 3 rows of a 20×20 grid — never reaches center strip
    const width = 20;
    const sol = Array.from({ length: 30 }, (_, i) => i); // cells 0..29 = rows 0-1
    const result = sameSideDepthGate(sol, width, 20, 0 as Side); // top
    expect(result).toBe(false);
  });

  it('returns true when path reaches the center strip (top/bottom)', () => {
    // Include a cell at y=10 (center of 20×20, which is in 35%-65% strip)
    const width = 20;
    const sol = [0, 1, width * 10 + 5]; // y=0 row, then y=10
    const result = sameSideDepthGate(sol, width, 20, 0 as Side); // top
    expect(result).toBe(true);
  });

  it('returns false when path stays near left side (left/right same-side)', () => {
    // Path entirely in left 2 columns of a 20×20 grid
    const width = 20;
    const sol = [0, 20, 40, 60, 80]; // x=0, y=0,1,2,3,4
    const result = sameSideDepthGate(sol, width, 20, 3 as Side); // left
    expect(result).toBe(false);
  });

  it('returns true when path reaches the center strip (left/right)', () => {
    // Include a cell at x=10 (center of 20×20)
    const width = 20;
    const sol = [0, 20, 5 * 20 + 10]; // (0,0), (0,1), (10,5)
    const result = sameSideDepthGate(sol, width, 20, 3 as Side); // left
    expect(result).toBe(true);
  });
});

// ── Integration tests — generation with quality scoring ───────────────────────

describe('generateMaze with anyPortalSide — quality scoring', () => {
  const SIZES = [
    { w: 20,  h: 20,  difficulty: 'small'  as const, minTurns: 5  },
    { w: 40,  h: 40,  difficulty: 'medium' as const, minTurns: 20 },
    { w: 60,  h: 60,  difficulty: 'large'  as const, minTurns: 40 },
  ];

  for (const { w, h, difficulty, minTurns } of SIZES) {
    it(`generates successfully in full mode at ${w}×${h}`, () => {
      const maze = generateMaze({ width: w, height: h, difficulty, seed: 42, anyPortalSide: true });
      expect(maze.solution.length).toBeGreaterThan(0);
      expect(maze.entry).toBeDefined();
      expect(maze.exit).toBeDefined();
    });

    it(`generates successfully in light mode at ${w}×${h}`, () => {
      const maze = generateMaze({ width: w, height: h, difficulty, seed: 42, anyPortalSide: true, lightMode: true });
      expect(maze.solution.length).toBeGreaterThan(0);
    });

    it(`solution has at least ${minTurns} turns at ${w}×${h} (across 5 seeds)`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const maze = generateMaze({ width: w, height: h, difficulty, seed, anyPortalSide: true });
        const metrics = scoreMetrics(maze.solution, w, h);
        expect(metrics.turnCount).toBeGreaterThanOrEqual(minTurns);
      }
    });

    it(`solution visits at least 4 zones at ${w}×${h} (across 5 seeds)`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const maze = generateMaze({ width: w, height: h, difficulty, seed, anyPortalSide: true });
        const metrics = scoreMetrics(maze.solution, w, h);
        expect(metrics.zoneCount).toBeGreaterThanOrEqual(4);
      }
    });

    it(`minSpan is between 0 and 1 at ${w}×${h} (across 5 seeds)`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const maze = generateMaze({ width: w, height: h, difficulty, seed, anyPortalSide: true });
        const metrics = scoreMetrics(maze.solution, w, h);
        expect(metrics.minSpan).toBeGreaterThanOrEqual(0);
        expect(metrics.minSpan).toBeLessThanOrEqual(1);
      }
    });
  }

  it('full mode and light mode both produce valid mazes for the same seed', () => {
    const opts = { width: 40, height: 40, difficulty: 'medium' as const, seed: 12345, anyPortalSide: true };
    const full  = generateMaze({ ...opts });
    const light = generateMaze({ ...opts, lightMode: true });
    expect(full.solution.length).toBeGreaterThan(0);
    expect(light.solution.length).toBeGreaterThan(0);
  });
});
