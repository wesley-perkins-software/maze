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
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'kids', 'adults'];

  it('produces correct grid dimensions', () => {
    const maze = generateMaze({ width: 10, height: 8, difficulty: 'medium', seed: 1 });
    expect(maze.grid.length).toBe(10 * 8);
    expect(maze.width).toBe(10);
    expect(maze.height).toBe(8);
  });

  it('all cells are reachable (perfect maze guarantee)', () => {
    for (const diff of difficulties) {
      const maze = generateMaze({ width: 10, height: 10, difficulty: diff, seed: 42 });
      expect(allCellsReachable(maze), `${diff} maze should have all cells reachable`).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const m1 = generateMaze({ width: 8, height: 8, difficulty: 'hard', seed: 999 });
    const m2 = generateMaze({ width: 8, height: 8, difficulty: 'hard', seed: 999 });
    expect(m1.grid).toEqual(m2.grid);
  });

  it('produces different mazes for different seeds', () => {
    const m1 = generateMaze({ width: 8, height: 8, difficulty: 'hard', seed: 1 });
    const m2 = generateMaze({ width: 8, height: 8, difficulty: 'hard', seed: 2 });
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

  it('easy mazes are more open than hard mazes (fewer walls)', () => {
    // Fewer internal walls = more passage bits cleared
    const countPassages = (m: ReturnType<typeof generateMaze>) =>
      m.grid.reduce((sum, cell) => {
        let c = 0;
        if (!(cell & 1)) c++; // N open
        if (!(cell & 2)) c++; // E open
        if (!(cell & 4)) c++; // S open
        if (!(cell & 8)) c++; // W open
        return sum + c;
      }, 0);

    const easy = generateMaze({ width: 10, height: 10, difficulty: 'easy',  seed: 77 });
    const hard = generateMaze({ width: 10, height: 10, difficulty: 'hard',  seed: 77 });
    expect(countPassages(easy)).toBeGreaterThan(countPassages(hard));
  });
});
