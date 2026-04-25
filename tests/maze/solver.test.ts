import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { solveMaze } from '../../src/lib/maze/solver';
import { pointToIndex, getPassages } from '../../src/lib/maze/utils';

describe('solveMaze', () => {
  it('returns a path from entry to exit', () => {
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 42 });
    const path = solveMaze(maze);
    expect(path[0]).toBe(pointToIndex(maze.entry, maze.width));
    expect(path[path.length - 1]).toBe(pointToIndex(maze.exit, maze.width));
  });

  it('each step in the path is a valid passage', () => {
    const maze = generateMaze({ width: 10, height: 10, difficulty: 'medium', seed: 99 });
    const path = solveMaze(maze);
    const { width, height, grid } = maze;

    for (let i = 0; i < path.length - 1; i++) {
      const from = { x: path[i] % width, y: Math.floor(path[i] / width) };
      const to   = { x: path[i + 1] % width, y: Math.floor(path[i + 1] / width) };
      const passages = getPassages(grid, from, width, height);
      const reachable = passages.some((p) => p.x === to.x && p.y === to.y);
      expect(reachable, `Step ${i}: (${from.x},${from.y}) → (${to.x},${to.y}) should be a passage`).toBe(true);
    }
  });

  it('is consistent with the maze solution stored in MazeData', () => {
    const maze = generateMaze({ width: 6, height: 6, difficulty: 'small', seed: 7 });
    const fresh = solveMaze(maze);
    expect(fresh).toEqual(maze.solution);
  });

  it('works for a 1x1 maze', () => {
    const maze = generateMaze({ width: 1, height: 1, difficulty: 'small', seed: 1 });
    const path = solveMaze(maze);
    expect(path).toHaveLength(1);
    expect(path[0]).toBe(0);
  });
});
