import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { pointToIndex, getPassages } from '../../src/lib/maze/utils';
import type { Difficulty } from '../../src/types/maze';

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

  it('larger tiers have more open passages than smaller tiers (braiding effect)', () => {
    const countPassages = (m: ReturnType<typeof generateMaze>) =>
      m.grid.reduce((sum, cell) => {
        let c = 0;
        if (!(cell & 1)) c++; // N open
        if (!(cell & 2)) c++; // E open
        if (!(cell & 4)) c++; // S open
        if (!(cell & 8)) c++; // W open
        return sum + c;
      }, 0);

    // Use same size grid but different tier configs to isolate braid effect
    const small = generateMaze({ width: 15, height: 15, difficulty: 'small',  seed: 77 });
    const large = generateMaze({ width: 15, height: 15, difficulty: 'large',  seed: 77 });
    expect(countPassages(large)).toBeGreaterThan(countPassages(small));
  });

  it('large mazes have more loops than small (braid factor difference)', () => {
    // Count cycles: a maze with W cells and exactly W-1 edges is a tree (0 loops).
    // Each extra edge = 1 more loop. Count by: edges - (cells - 1).
    function countLoops(m: ReturnType<typeof generateMaze>): number {
      const total = m.width * m.height;
      // Count unique undirected edges by checking E and S walls
      let edges = 0;
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const cell = m.grid[y * m.width + x];
          if (!(cell & 2) && x + 1 < m.width) edges++; // east passage
          if (!(cell & 4) && y + 1 < m.height) edges++; // south passage
        }
      }
      return edges - (total - 1);
    }

    // Run multiple seeds and check average — braiding is probabilistic
    let smallLoops = 0;
    let largeLoops = 0;
    for (let s = 1; s <= 10; s++) {
      smallLoops += countLoops(generateMaze({ width: 20, height: 20, difficulty: 'small', seed: s }));
      largeLoops += countLoops(generateMaze({ width: 20, height: 20, difficulty: 'large', seed: s }));
    }
    expect(largeLoops).toBeGreaterThan(smallLoops);
  });

  it('accepts custom newestBias and braidFactor overrides', () => {
    // Full DFS (no braiding) — should produce a tree (0 loops)
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
