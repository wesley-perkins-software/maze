import type { MazeGrid, Point } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';

export function pointToIndex(p: Point, width: number): number {
  return p.y * width + p.x;
}

export function indexToPoint(index: number, width: number): Point {
  return { x: index % width, y: Math.floor(index / width) };
}

export function inBounds(p: Point, width: number, height: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
}

/** Direction vectors and their corresponding wall bits */
export const DIRECTIONS = [
  { dx: 0,  dy: -1, wall: WALL_N, opposite: WALL_S },
  { dx: 1,  dy:  0, wall: WALL_E, opposite: WALL_W },
  { dx: 0,  dy:  1, wall: WALL_S, opposite: WALL_N },
  { dx: -1, dy:  0, wall: WALL_W, opposite: WALL_E },
] as const;

/**
 * Returns the points reachable from `p` (no wall between them).
 */
export function getPassages(
  grid: MazeGrid,
  p: Point,
  width: number,
  height: number,
): Point[] {
  const index = pointToIndex(p, width);
  const cellWalls = grid[index];
  const result: Point[] = [];

  for (const { dx, dy, wall } of DIRECTIONS) {
    if (cellWalls & wall) continue; // wall present → no passage
    const neighbor: Point = { x: p.x + dx, y: p.y + dy };
    if (inBounds(neighbor, width, height)) {
      result.push(neighbor);
    }
  }

  return result;
}

/**
 * Remove a wall between two adjacent cells.
 * Both cells must be valid and adjacent.
 */
export function removeWall(
  grid: MazeGrid,
  from: Point,
  to: Point,
  width: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fromIdx = pointToIndex(from, width);
  const toIdx = pointToIndex(to, width);

  if (dx === 1) {
    grid[fromIdx] &= ~WALL_E;
    grid[toIdx]   &= ~WALL_W;
  } else if (dx === -1) {
    grid[fromIdx] &= ~WALL_W;
    grid[toIdx]   &= ~WALL_E;
  } else if (dy === 1) {
    grid[fromIdx] &= ~WALL_S;
    grid[toIdx]   &= ~WALL_N;
  } else if (dy === -1) {
    grid[fromIdx] &= ~WALL_N;
    grid[toIdx]   &= ~WALL_S;
  }
}

/**
 * Returns the center pixel coordinate of a cell for SVG rendering.
 */
export function cellCenter(p: Point, cellSize: number): { cx: number; cy: number } {
  return {
    cx: p.x * cellSize + cellSize / 2,
    cy: p.y * cellSize + cellSize / 2,
  };
}
