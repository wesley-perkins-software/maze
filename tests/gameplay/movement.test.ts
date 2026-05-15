import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { applyMove, canMove, computeRun, getEntryDirection, getEntryStartPosition } from '../../src/lib/gameplay/movement';
import type { MazeData, Point } from '../../src/types/maze';
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

type EntranceSide = 'top' | 'right' | 'bottom' | 'left';

function makeStraightEntranceMaze(side: EntranceSide): MazeData {
  const width = 5;
  const height = 5;
  const grid = Array(width * height).fill(15);
  const base = {
    id: `straight-${side}`,
    slug: `straight-${side}`,
    difficulty: 'small' as const,
    width,
    height,
    seed: 1,
    exit: { x: 2, y: 2 },
    solution: [],
    generatedAt: '2026-05-09T00:00:00.000Z',
  };

  switch (side) {
    case 'top':
      grid.splice(0, width, 13, 5, 4, 5, 7);
      return { ...base, entry: { x: 2, y: 0 }, grid };
    case 'bottom':
      grid.splice(20, width, 13, 5, 0, 5, 7);
      return { ...base, entry: { x: 2, y: 4 }, grid };
    case 'left':
      [0, 1, 2, 3, 4].forEach(y => {
        grid[y * width] = y === 0 ? 11 : y === 2 ? 2 : y === 4 ? 14 : 10;
      });
      return { ...base, entry: { x: 0, y: 2 }, grid };
    case 'right':
      [0, 1, 2, 3, 4].forEach(y => {
        grid[y * width + 4] = y === 0 ? 11 : y === 2 ? 8 : y === 4 ? 14 : 10;
      });
      return { ...base, entry: { x: 4, y: 2 }, grid };
  }
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

  it('stops on the top entry cell instead of running through a straight corridor', () => {
    const maze = makeStraightEntranceMaze('top');

    const path = computeRun(maze, { x: 0, y: 0 }, 'E');

    expect(path.at(-1)).toEqual(maze.entry);
  });

  it('does not include cells beyond the entry cell in the same run', () => {
    const maze = makeStraightEntranceMaze('top');

    const path = computeRun(maze, { x: 0, y: 0 }, 'E');

    expect(path).toEqual([
      { x: 1, y: 0 },
      maze.entry,
    ]);
    expect(path).not.toContainEqual({ x: 3, y: 0 });
  });

  it('can move away from the entry cell on the next run input', () => {
    const maze = makeStraightEntranceMaze('top');

    expect(computeRun(maze, maze.entry, 'E')).toEqual([
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it.each([
    ['top', { x: 0, y: 0 }, 'E'],
    ['right', { x: 4, y: 4 }, 'N'],
    ['bottom', { x: 4, y: 4 }, 'W'],
    ['left', { x: 0, y: 0 }, 'S'],
  ] as const)('stops on the %s entry cell during straight-corridor runs', (side, start, direction) => {
    const maze = makeStraightEntranceMaze(side);

    const path = computeRun(maze, start, direction);

    expect(path.at(-1)).toEqual(maze.entry);
  });
});
