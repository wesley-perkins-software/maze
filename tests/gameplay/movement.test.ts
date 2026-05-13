import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { applyMove, canMove, computeCorridorRun, computeRun, getEntryDirection, getEntryStartPosition } from '../../src/lib/gameplay/movement';
import type { Point } from '../../src/types/maze';
import type { Direction } from '../../src/lib/gameplay/types';

/**
 * Returns the direction that faces outward from a perimeter cell.
 * Used to test that the player cannot exit through the entry/exit gap.
 */
function perimeterDir(pt: Point, width: number, height: number): Direction {
  if (pt.y === 0)          return 'N';
  if (pt.y === height - 1) return 'S';
  if (pt.x === 0)          return 'W';
  return 'E';
}


function mazeWithOpenPassages(width: number, height: number, passages: Array<[number, number, Direction]>) {
  const wallBit: Record<Direction, number> = { N: 1, E: 2, S: 4, W: 8 };
  const reverse: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' };
  const delta: Record<Direction, { dx: number; dy: number }> = {
    N: { dx: 0, dy: -1 },
    E: { dx: 1, dy: 0 },
    S: { dx: 0, dy: 1 },
    W: { dx: -1, dy: 0 },
  };
  const grid = Array(width * height).fill(15);

  for (const [x, y, direction] of passages) {
    const next = { x: x + delta[direction].dx, y: y + delta[direction].dy };
    grid[y * width + x] &= ~wallBit[direction];
    grid[next.y * width + next.x] &= ~wallBit[reverse[direction]];
  }

  return {
    id: 'corridor-test',
    slug: 'corridor-test',
    difficulty: 'small' as const,
    width,
    height,
    seed: 1,
    entry: { x: 0, y: 1 },
    exit: { x: width - 1, y: height - 1 },
    grid,
    solution: [],
    generatedAt: '2026-05-09T00:00:00.000Z',
  };
}

describe('canMove', () => {
  it('cannot move out through the entry gap', () => {
    // The generator opens the perimeter wall at entry for the visual gap.
    // canMove must still return false — the destination is outside the grid.
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 1 });
    const dir = perimeterDir(maze.entry, maze.width, maze.height);
    expect(canMove(maze, maze.entry, dir)).toBe(false);
  });

  it('cannot move out through the exit gap', () => {
    // Same invariant at the exit cell.
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 1 });
    const dir = perimeterDir(maze.exit, maze.width, maze.height);
    expect(canMove(maze, maze.exit, dir)).toBe(false);
  });

  it('returns true when passage exists — solution path is always traversable', () => {
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 1 });
    const solution = maze.solution;
    for (let i = 0; i < solution.length - 1; i++) {
      const from = { x: solution[i] % maze.width, y: Math.floor(solution[i] / maze.width) };
      const to   = { x: solution[i+1] % maze.width, y: Math.floor(solution[i+1] / maze.width) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dir: Direction = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
      expect(canMove(maze, from, dir)).toBe(true);
    }
  });
});

describe('applyMove', () => {
  it('moves N correctly', () => expect(applyMove({x:2,y:3},'N')).toEqual({x:2,y:2}));
  it('moves E correctly', () => expect(applyMove({x:2,y:3},'E')).toEqual({x:3,y:3}));
  it('moves S correctly', () => expect(applyMove({x:2,y:3},'S')).toEqual({x:2,y:4}));
  it('moves W correctly', () => expect(applyMove({x:2,y:3},'W')).toEqual({x:1,y:3}));
});


describe('computeRun', () => {
  it('starts from the entry marker and stops at the next directional choice', () => {
    const maze = {
      id: 'test',
      slug: 'test',
      difficulty: 'small' as const,
      width: 4,
      height: 3,
      seed: 1,
      entry: { x: 0, y: 1 },
      exit: { x: 3, y: 1 },
      grid: [
        15, 15, 11, 15,
        5, 5, 6, 15,
        15, 15, 15, 15,
      ],
      solution: [],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    expect(getEntryStartPosition(maze)).toEqual({ x: -1, y: 1 });
    expect(getEntryDirection(maze)).toBe('E');
    expect(computeRun(maze, getEntryStartPosition(maze), 'E')).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
});


describe('computeCorridorRun', () => {
  it('continues through a forced turn but stops before choosing at an intersection', () => {
    const maze = mazeWithOpenPassages(4, 4, [
      [0, 1, 'E'],
      [1, 1, 'S'],
      [1, 2, 'E'],
      [2, 2, 'E'],
      [2, 2, 'N'],
    ]);

    expect(computeCorridorRun(maze, { x: 0, y: 1 }, 'E', { maxSteps: 10 })).toEqual([
      { position: { x: 1, y: 1 }, direction: 'E' },
      { position: { x: 1, y: 2 }, direction: 'S' },
      { position: { x: 2, y: 2 }, direction: 'E' },
    ]);
  });

  it('returns no steps when the requested initial direction is blocked', () => {
    const maze = mazeWithOpenPassages(3, 3, [[0, 1, 'E']]);
    expect(computeCorridorRun(maze, { x: 0, y: 1 }, 'N', { maxSteps: 10 })).toEqual([]);
  });

  it('applies the maximum run length cap', () => {
    const maze = mazeWithOpenPassages(6, 1, [
      [0, 0, 'E'],
      [1, 0, 'E'],
      [2, 0, 'E'],
      [3, 0, 'E'],
      [4, 0, 'E'],
    ]);

    expect(computeCorridorRun(maze, { x: 0, y: 0 }, 'E', { maxSteps: 3 })).toHaveLength(3);
  });
});
