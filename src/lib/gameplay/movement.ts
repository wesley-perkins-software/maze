import type { MazeData, Point } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { pointToIndex } from '../maze/utils';
import type { Direction } from './types';

const DIR_WALL: Record<Direction, number> = {
  N: WALL_N,
  E: WALL_E,
  S: WALL_S,
  W: WALL_W,
};

const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  N: { dx:  0, dy: -1 },
  E: { dx:  1, dy:  0 },
  S: { dx:  0, dy:  1 },
  W: { dx: -1, dy:  0 },
};

/**
 * Returns true if there is no wall between `from` and the neighbor in `direction`.
 */
export function canMove(maze: MazeData, from: Point, direction: Direction): boolean {
  const idx = pointToIndex(from, maze.width);
  const cell = maze.grid[idx];
  return !(cell & DIR_WALL[direction]);
}

/**
 * Returns the new position after moving in `direction`.
 * Caller must ensure canMove() is true first.
 */
export function applyMove(from: Point, direction: Direction): Point {
  const { dx, dy } = DIR_DELTA[direction];
  return { x: from.x + dx, y: from.y + dy };
}
