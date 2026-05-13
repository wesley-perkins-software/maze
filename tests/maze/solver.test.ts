import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { solveMaze, solveMazeFrom, findShortestPath } from '../../src/lib/maze/solver';
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

  it('returns a path from an arbitrary current cell to the exit', () => {
    const maze = generateMaze({ width: 10, height: 10, difficulty: 'medium', seed: 99 });
    const start = { x: 3, y: 4 };
    const path = solveMazeFrom(maze, start);
    expect(path[0]).toBe(pointToIndex(start, maze.width));
    expect(path[path.length - 1]).toBe(pointToIndex(maze.exit, maze.width));

    for (let i = 0; i < path.length - 1; i++) {
      const from = { x: path[i] % maze.width, y: Math.floor(path[i] / maze.width) };
      const to = { x: path[i + 1] % maze.width, y: Math.floor(path[i + 1] / maze.width) };
      const passages = getPassages(maze.grid, from, maze.width, maze.height);
      expect(passages.some((p) => p.x === to.x && p.y === to.y)).toBe(true);
    }
  });

  it('works for a 1x1 maze', () => {
    const maze = generateMaze({ width: 1, height: 1, difficulty: 'small', seed: 1 });
    const path = solveMaze(maze);
    expect(path).toHaveLength(1);
    expect(path[0]).toBe(0);
  });
});

describe('findShortestPath', () => {
  it('returns empty array when from and target are the same cell', () => {
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 42 });
    const result = findShortestPath(maze, maze.entry, maze.entry, 5);
    expect(result).toEqual([]);
  });

  it('returns a valid passage path when target is reachable within maxSteps', () => {
    const maze = generateMaze({ width: 10, height: 10, difficulty: 'medium', seed: 99 });
    // Follow the solution path: pick a target 3 steps ahead of entry
    const solutionPath = solveMaze(maze);
    const target = {
      x: solutionPath[3] % maze.width,
      y: Math.floor(solutionPath[3] / maze.width),
    };
    const path = findShortestPath(maze, maze.entry, target, 5);
    expect(path).not.toBeNull();
    expect(path!.length).toBeLessThanOrEqual(5);

    // Every step must be a valid passage
    const full = [maze.entry, ...path!];
    for (let i = 0; i < full.length - 1; i++) {
      const passages = getPassages(maze.grid, full[i], maze.width, maze.height);
      expect(passages.some(p => p.x === full[i + 1].x && p.y === full[i + 1].y)).toBe(true);
    }

    // Last point in path must be the target
    expect(path![path!.length - 1]).toEqual(target);
  });

  it('returns null when target is beyond maxSteps', () => {
    const maze = generateMaze({ width: 10, height: 10, difficulty: 'large', seed: 42 });
    // The exit is many steps from entry — definitely > 2 steps
    const result = findShortestPath(maze, maze.entry, maze.exit, 2);
    expect(result).toBeNull();
  });

  it('returns null for an out-of-bounds target', () => {
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 1 });
    expect(findShortestPath(maze, maze.entry, { x: -1, y: 0 }, 5)).toBeNull();
    expect(findShortestPath(maze, maze.entry, { x: 0, y: 99 }, 5)).toBeNull();
  });

  it('returns null for an out-of-bounds from position', () => {
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 1 });
    expect(findShortestPath(maze, { x: -1, y: 0 }, maze.exit, 5)).toBeNull();
  });

  it('finds the exit when maxSteps is large enough', () => {
    const maze = generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 42 });
    const result = findShortestPath(maze, maze.entry, maze.exit, 100);
    expect(result).not.toBeNull();
    expect(result![result!.length - 1]).toEqual(maze.exit);
  });
});
