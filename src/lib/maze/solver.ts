/**
 * Maze Solver — BFS shortest path from entry to exit.
 * Pure function, no side effects.
 * Returns an array of flat cell indices representing the solution path.
 */
import type { MazeData, Point } from '../../types/maze';
import { pointToIndex, indexToPoint, getPassages } from './utils';

/**
 * BFS shortest path between two arbitrary in-bounds cells, limited to
 * `maxSteps` passage traversals. Returns the path from `from` to `target`
 * as an ordered array of Points (excluding `from`), or null if the target
 * is not reachable within the step limit.
 */
export function findShortestPath(
  maze: MazeData,
  from: Point,
  target: Point,
  maxSteps: number,
): Point[] | null {
  const { width, height, grid } = maze;

  if (from.x < 0 || from.y < 0 || from.x >= width || from.y >= height) return null;
  if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;

  const fromIdx   = pointToIndex(from,   width);
  const targetIdx = pointToIndex(target, width);

  if (fromIdx === targetIdx) return [];

  const total   = width * height;
  const prev    = new Int32Array(total).fill(-1);
  const visited = new Uint8Array(total);
  // Each queue entry: [cellIndex, depthFromStart]
  const queue: [number, number][] = [[fromIdx, 0]];
  visited[fromIdx] = 1;

  let found = false;

  outer: while (queue.length > 0) {
    const [idx, depth] = queue.shift()!;

    if (idx === targetIdx) { found = true; break; }
    if (depth >= maxSteps) continue;

    const passages = getPassages(grid, indexToPoint(idx, width), width, height);
    for (const neighbor of passages) {
      const ni = pointToIndex(neighbor, width);
      if (visited[ni]) continue;
      visited[ni] = 1;
      prev[ni] = idx;
      if (ni === targetIdx) { found = true; break outer; }
      queue.push([ni, depth + 1]);
    }
  }

  if (!found) return null;

  const path: Point[] = [];
  let cur = targetIdx;
  while (cur !== fromIdx) {
    path.unshift(indexToPoint(cur, width));
    cur = prev[cur];
  }
  return path;
}

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
