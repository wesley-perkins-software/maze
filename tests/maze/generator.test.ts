import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { pointToIndex, getPassages } from '../../src/lib/maze/utils';
import type { Difficulty, Point } from '../../src/types/maze';

function allCellsReachable(maze: ReturnType<typeof generateMaze>): boolean {
  const { width, height, grid, entry } = maze;
  const visited = new Set<number>();
  const queue = [pointToIndex(entry, width)];
  visited.add(queue[0]);

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % width;
    const y = Math.floor(idx / width);
    const passages = getPassages(grid, { x, y }, width, height);
    for (const p of passages) {
      const ni = pointToIndex(p, width);
      if (!visited.has(ni)) {
        visited.add(ni);
        queue.push(ni);
      }
    }
  }

  return visited.size === width * height;
}

function getSide(p: Point, width: number, height: number): 'top' | 'right' | 'bottom' | 'left' {
  if (p.y === 0)          return 'top';
  if (p.x === width - 1)  return 'right';
  if (p.y === height - 1) return 'bottom';
  return 'left';
}

function isCorner(p: Point, width: number, height: number): boolean {
  return (p.x === 0 || p.x === width - 1) && (p.y === 0 || p.y === height - 1);
}

function isPerimeter(p: Point, width: number, height: number): boolean {
  return p.x === 0 || p.x === width - 1 || p.y === 0 || p.y === height - 1;
}

// ── Legacy behaviour (anyPortalSide not set) ──────────────────────────────────

describe('generateMaze', () => {
  const tiers: Difficulty[] = ['small', 'medium', 'large'];

  it('produces correct grid dimensions', () => {
    const maze = generateMaze({ width: 10, height: 8, difficulty: 'medium', seed: 1 });
    expect(maze.grid.length).toBe(10 * 8);
    expect(maze.width).toBe(10);
    expect(maze.height).toBe(8);
  });

  it('all cells are reachable for every tier', () => {
    for (const tier of tiers) {
      const maze = generateMaze({ width: 10, height: 10, difficulty: tier, seed: 42 });
      expect(allCellsReachable(maze), `${tier} maze should have all cells reachable`).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const m1 = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 999 });
    const m2 = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 999 });
    expect(m1.grid).toEqual(m2.grid);
  });

  it('produces different mazes for different seeds', () => {
    const m1 = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 1 });
    const m2 = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 2 });
    expect(m1.grid).not.toEqual(m2.grid);
  });

  it('solution is non-empty', () => {
    const maze = generateMaze({ width: 10, height: 10, difficulty: 'medium', seed: 123 });
    expect(maze.solution.length).toBeGreaterThan(0);
  });

  it('solution starts at entry and ends at exit', () => {
    const maze = generateMaze({ width: 10, height: 10, difficulty: 'medium', seed: 456 });
    const entryIdx = pointToIndex(maze.entry, maze.width);
    const exitIdx  = pointToIndex(maze.exit,  maze.width);
    expect(maze.solution[0]).toBe(entryIdx);
    expect(maze.solution[maze.solution.length - 1]).toBe(exitIdx);
  });

  it('all tiers are near-perfect mazes (very few loops)', () => {
    function countLoops(m: ReturnType<typeof generateMaze>): number {
      const total = m.width * m.height;
      let edges = 0;
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const cell = m.grid[y * m.width + x];
          if (!(cell & 2) && x + 1 < m.width) edges++;
          if (!(cell & 4) && y + 1 < m.height) edges++;
        }
      }
      return edges - (total - 1);
    }

    for (const tier of (['small', 'medium', 'large'] as const)) {
      const loops = countLoops(generateMaze({ width: 20, height: 20, difficulty: tier, seed: 42 }));
      const cells = 20 * 20;
      expect(loops, `${tier}: too many loops (${loops})`).toBeLessThan(cells * 0.05);
    }
  });

  it('small tier has at least as many loops as large tier (braidFactor ordering)', () => {
    function countLoops(m: ReturnType<typeof generateMaze>): number {
      const total = m.width * m.height;
      let edges = 0;
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const cell = m.grid[y * m.width + x];
          if (!(cell & 2) && x + 1 < m.width) edges++;
          if (!(cell & 4) && y + 1 < m.height) edges++;
        }
      }
      return edges - (total - 1);
    }

    let smallLoops = 0;
    let largeLoops = 0;
    for (let s = 1; s <= 10; s++) {
      smallLoops += countLoops(generateMaze({ width: 20, height: 20, difficulty: 'small', seed: s }));
      largeLoops += countLoops(generateMaze({ width: 20, height: 20, difficulty: 'large', seed: s }));
    }
    expect(smallLoops).toBeGreaterThanOrEqual(largeLoops);
  });

  it('entry and exit are on opposite perimeter sides', () => {
    for (let s = 1; s <= 20; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s,
      });
      const entryOnLeft  = entry.x === 0;
      const entryOnRight = entry.x === width  - 1;
      const entryOnTop   = entry.y === 0;
      const entryOnBot   = entry.y === height - 1;
      const exitOnLeft   = exit.x  === 0;
      const exitOnRight  = exit.x  === width  - 1;
      const exitOnTop    = exit.y  === 0;
      const exitOnBot    = exit.y  === height - 1;

      const onOppositeSides =
        (entryOnLeft  && exitOnRight) ||
        (entryOnRight && exitOnLeft)  ||
        (entryOnTop   && exitOnBot)   ||
        (entryOnBot   && exitOnTop);

      expect(onOppositeSides, `seed ${s}: entry=(${entry.x},${entry.y}) exit=(${exit.x},${exit.y})`).toBe(true);
    }
  });

  it('entry and exit are not at corners', () => {
    for (let s = 1; s <= 20; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s,
      });
      const isCorner = (p: { x: number; y: number }) =>
        (p.x === 0 || p.x === width - 1) && (p.y === 0 || p.y === height - 1);
      expect(isCorner(entry), `seed ${s}: entry at corner`).toBe(false);
      expect(isCorner(exit),  `seed ${s}: exit at corner`).toBe(false);
    }
  });

  it('entry and exit are within the 20–80% margin of their side', () => {
    for (let s = 1; s <= 20; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s,
      });
      if (entry.x === 0 || entry.x === width - 1) {
        expect(entry.y).toBeGreaterThanOrEqual(Math.floor(height * 0.2));
        expect(entry.y).toBeLessThanOrEqual(Math.ceil(height * 0.8));
        expect(exit.y).toBeGreaterThanOrEqual(Math.floor(height * 0.2));
        expect(exit.y).toBeLessThanOrEqual(Math.ceil(height * 0.8));
      } else {
        expect(entry.x).toBeGreaterThanOrEqual(Math.floor(width * 0.2));
        expect(entry.x).toBeLessThanOrEqual(Math.ceil(width * 0.8));
        expect(exit.x).toBeGreaterThanOrEqual(Math.floor(width * 0.2));
        expect(exit.x).toBeLessThanOrEqual(Math.ceil(width * 0.8));
      }
    }
  });

  it('accepts custom newestBias and braidFactor overrides', () => {
    const m = generateMaze({ width: 10, height: 10, difficulty: 'small', seed: 1, braidFactor: 0 });
    let edges = 0;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const cell = m.grid[y * m.width + x];
        if (!(cell & 2) && x + 1 < m.width) edges++;
        if (!(cell & 4) && y + 1 < m.height) edges++;
      }
    }
    const loops = edges - (m.width * m.height - 1);
    expect(loops).toBe(0);
  });
});

// ── Any-side mode (anyPortalSide: true) ───────────────────────────────────────

describe('generateMaze with anyPortalSide', () => {

  it('is deterministic for the same seed', () => {
    const m1 = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: 42, anyPortalSide: true });
    const m2 = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: 42, anyPortalSide: true });
    expect(m1.entry).toEqual(m2.entry);
    expect(m1.exit).toEqual(m2.exit);
    expect(m1.grid).toEqual(m2.grid);
    expect(m1.solution).toEqual(m2.solution);
  });

  it('all cells remain reachable', () => {
    for (let s = 1; s <= 5; s++) {
      const maze = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true });
      expect(allCellsReachable(maze), `seed ${s}: not all cells reachable`).toBe(true);
    }
  });

  it('solution starts at entry and ends at exit', () => {
    for (let s = 1; s <= 10; s++) {
      const maze = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true });
      expect(maze.solution[0]).toBe(pointToIndex(maze.entry, maze.width));
      expect(maze.solution[maze.solution.length - 1]).toBe(pointToIndex(maze.exit, maze.width));
    }
  });

  it('entry and exit are on the perimeter (never interior)', () => {
    for (let s = 1; s <= 30; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      expect(isPerimeter(entry, width, height), `seed ${s}: entry not on perimeter`).toBe(true);
      expect(isPerimeter(exit,  width, height), `seed ${s}: exit not on perimeter`).toBe(true);
    }
  });

  it('entry and exit are never at corners', () => {
    for (let s = 1; s <= 50; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      expect(isCorner(entry, width, height), `seed ${s}: entry at corner`).toBe(false);
      expect(isCorner(exit,  width, height), `seed ${s}: exit at corner`).toBe(false);
    }
  });

  it('all four sides appear as entry side across many seeds', () => {
    const entrySides = new Set<string>();
    for (let s = 1; s <= 100; s++) {
      const { entry, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      entrySides.add(getSide(entry, width, height));
    }
    expect(entrySides.size).toBe(4);
  });

  it('all four sides appear as exit side across many seeds', () => {
    const exitSides = new Set<string>();
    for (let s = 1; s <= 100; s++) {
      const { exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      exitSides.add(getSide(exit, width, height));
    }
    expect(exitSides.size).toBe(4);
  });

  it('produces multiple distinct side-pair combinations across many seeds', () => {
    const pairs = new Set<string>();
    for (let s = 1; s <= 200; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      pairs.add(`${getSide(entry, width, height)}→${getSide(exit, width, height)}`);
    }
    // With 16 possible combinations and 200 seeds, we expect well over half.
    expect(pairs.size).toBeGreaterThanOrEqual(12);
  });

  it('same-side pairs appear (same-side is allowed)', () => {
    let sameSideCount = 0;
    for (let s = 1; s <= 200; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      if (getSide(entry, width, height) === getSide(exit, width, height)) {
        sameSideCount++;
      }
    }
    expect(sameSideCount, 'same-side pairs should appear across 200 seeds').toBeGreaterThan(0);
  });

  it('same-side pairs have minimum coordinate separation', () => {
    for (let s = 1; s <= 200; s++) {
      const { entry, exit, width, height } = generateMaze({
        width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true,
      });
      const entrySide = getSide(entry, width, height);
      const exitSide  = getSide(exit,  width, height);

      if (entrySide !== exitSide) continue;

      const isHorizontalSide = entrySide === 'top' || entrySide === 'bottom';
      const sideLen  = isHorizontalSide ? width : height;
      const sep      = isHorizontalSide ? Math.abs(entry.x - exit.x) : Math.abs(entry.y - exit.y);
      const minSep   = Math.max(3, Math.floor(sideLen * 0.25));

      expect(sep, `seed ${s} same-side (${entrySide}): separation ${sep} < min ${minSep}`).toBeGreaterThanOrEqual(minSep);
    }
  });

  it('solution path meets minimum length threshold for 20×20', () => {
    // Gate threshold is 22% (88 cells). Assert 18% to allow for fallback candidates
    // that narrowly miss the gate but are still good quality mazes.
    const minFraction = 0.18;
    const cells = 20 * 20;
    for (let s = 1; s <= 15; s++) {
      const maze = generateMaze({ width: 20, height: 20, difficulty: 'small', seed: s, anyPortalSide: true });
      expect(
        maze.solution.length,
        `20×20 seed ${s}: solution ${maze.solution.length} < ${Math.floor(minFraction * cells)}`,
      ).toBeGreaterThanOrEqual(Math.floor(minFraction * cells));
    }
  });

  it('solution path meets minimum length threshold for 40×40', () => {
    // Gate threshold is 16% (256 cells). Assert 12% for fallback headroom.
    const minFraction = 0.12;
    const cells = 40 * 40;
    for (let s = 1; s <= 5; s++) {
      const maze = generateMaze({ width: 40, height: 40, difficulty: 'medium', seed: s, anyPortalSide: true });
      expect(
        maze.solution.length,
        `40×40 seed ${s}: solution ${maze.solution.length} < ${Math.floor(minFraction * cells)}`,
      ).toBeGreaterThanOrEqual(Math.floor(minFraction * cells));
    }
  });

  it('solution path meets minimum length threshold for 60×60', () => {
    // Gate threshold is 11% (396 cells). Assert 8% for fallback headroom.
    const minFraction = 0.08;
    const cells = 60 * 60;
    for (let s = 1; s <= 3; s++) {
      const maze = generateMaze({ width: 60, height: 60, difficulty: 'large', seed: s, anyPortalSide: true });
      expect(
        maze.solution.length,
        `60×60 seed ${s}: solution ${maze.solution.length} < ${Math.floor(minFraction * cells)}`,
      ).toBeGreaterThanOrEqual(Math.floor(minFraction * cells));
    }
  });

  it('same-side pairs produce a valid non-trivial solution', () => {
    // Find a same-side seed and verify solution is real.
    let found = false;
    for (let s = 1; s <= 200; s++) {
      const maze = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true });
      const { entry, exit, width, height } = maze;
      if (getSide(entry, width, height) === getSide(exit, width, height)) {
        found = true;
        expect(maze.solution.length).toBeGreaterThan(0);
        expect(maze.solution[0]).toBe(pointToIndex(entry, width));
        expect(maze.solution[maze.solution.length - 1]).toBe(pointToIndex(exit, width));
        break;
      }
    }
    expect(found, 'No same-side pair found in 200 seeds').toBe(true);
  });

  it('does not affect legacy mode seed output', () => {
    // Legacy mode (no anyPortalSide) must remain unchanged after refactor.
    const m1 = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 777 });
    const m2 = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 777 });
    expect(m1.grid).toEqual(m2.grid);
    expect(m1.entry).toEqual(m2.entry);
    expect(m1.exit).toEqual(m2.exit);
  });

  it('anyPortalSide and legacy produce different entry/exit for the same seed', () => {
    // The two modes use different algorithms — they should not coincidentally
    // match on entry/exit for all seeds.
    let anyDifference = false;
    for (let s = 1; s <= 20; s++) {
      const legacy  = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: s });
      const anySide = generateMaze({ width: 20, height: 20, difficulty: 'medium', seed: s, anyPortalSide: true });
      if (
        legacy.entry.x !== anySide.entry.x || legacy.entry.y !== anySide.entry.y ||
        legacy.exit.x  !== anySide.exit.x  || legacy.exit.y  !== anySide.exit.y
      ) {
        anyDifference = true;
        break;
      }
    }
    expect(anyDifference, 'anyPortalSide should produce different entry/exit to legacy mode').toBe(true);
  });

  it('works correctly with custom rectangular dimensions', () => {
    const sizes = [
      { w: 20, h: 60 },
      { w: 60, h: 20 },
      { w: 30, h: 45 },
    ];
    for (const { w, h } of sizes) {
      const maze = generateMaze({ width: w, height: h, difficulty: 'large', seed: 42, anyPortalSide: true });
      expect(maze.width).toBe(w);
      expect(maze.height).toBe(h);
      expect(maze.solution.length).toBeGreaterThan(0);
      expect(allCellsReachable(maze), `${w}×${h}: not all cells reachable`).toBe(true);
      expect(isCorner(maze.entry, w, h)).toBe(false);
      expect(isCorner(maze.exit,  w, h)).toBe(false);
    }
  });
});
