import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { canMove, applyMove } from '../../src/lib/gameplay/movement';
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
