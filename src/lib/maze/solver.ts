/**
 * Maze Solver — BFS shortest path from entry to exit.
 * Pure function, no side effects.
 * Returns an array of flat cell indices representing the solution path.
 */
import type { MazeData } from '../../types/maze';
import { pointToIndex, getPassages } from './utils';

export function solveMaze(maze: MazeData): number[] {
  return solveMazeFrom(maze, maze.entry);
}

/**
 * BFS shortest path from any in-bounds maze cell to the maze exit.
 * The returned path includes both `start` and `maze.exit`, making it suitable
 * for rendering overlays that must originate at the player's current cell.
 */
export function solveMazeFrom(maze: MazeData, start: MazeData['entry']): number[] {
  const { width, height, grid, exit } = maze;
  const total = width * height;

  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return [];

  const startIdx = pointToIndex(start, width);
  const exitIdx  = pointToIndex(exit,  width);

  if (startIdx === exitIdx) return [startIdx];

  const prev = new Int32Array(total).fill(-1);
  const visited = new Uint8Array(total);
  const queue: number[] = [startIdx];
  visited[startIdx] = 1;

  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (idx === exitIdx) break;

    const { x, y } = { x: idx % width, y: Math.floor(idx / width) };
    const passages = getPassages(grid, { x, y }, width, height);

    for (const neighbor of passages) {
      const ni = pointToIndex(neighbor, width);
      if (visited[ni]) continue;
      visited[ni] = 1;
      prev[ni] = idx;
      queue.push(ni);
    }
  }

  // Reconstruct path
  if (prev[exitIdx] === -1 && startIdx !== exitIdx) {
    // No solution found (should never happen for a perfect maze)
    return [];
  }

  const path: number[] = [];
  let cur = exitIdx;
  while (cur !== -1) {
    path.unshift(cur);
    cur = prev[cur];
  }

  return path;
}
