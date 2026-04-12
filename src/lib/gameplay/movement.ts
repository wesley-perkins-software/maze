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
 * Returns true if there is no wall between `from` and the neighbor in `direction`,
 * and the destination is within the grid bounds.
 *
 * Bounds check is necessary because the generator removes the North wall of the
 * entry cell and the South wall of the exit cell for visual entry/exit gaps —
 * those bits read as "open passage" even though the destination is outside the grid.
 */
export function canMove(maze: MazeData, from: Point, direction: Direction): boolean {
  const { dx, dy } = DIR_DELTA[direction];
  const destX = from.x + dx;
  const destY = from.y + dy;
  if (destX < 0 || destY < 0 || destX >= maze.width || destY >= maze.height) {
    return false;
  }
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

const REVERSE_DIR: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ALL_DIRS: Direction[] = ['N', 'E', 'S', 'W'];

/**
 * Walks from `startPos` in `direction` until hitting a wall or a junction
 * (a cell where any perpendicular direction is open, giving the player a
 * choice). The exit cell always terminates the run.
 *
 * Returns the ordered list of cells entered (not including startPos).
 * An empty array means the path is immediately blocked.
 */
export function computeRun(maze: MazeData, startPos: Point, direction: Direction): Point[] {
  const back = REVERSE_DIR[direction];
  const path: Point[] = [];
  let pos = startPos;

  while (canMove(maze, pos, direction)) {
    pos = applyMove(pos, direction);
    path.push({ ...pos });

    // Always stop at the exit
    if (pos.x === maze.exit.x && pos.y === maze.exit.y) break;

    // Stop at a junction: any direction other than forward and back is open
    const isJunction = ALL_DIRS
      .filter(d => d !== direction && d !== back)
      .some(d => canMove(maze, pos, d));
    if (isJunction) break;
  }

  return path;
}
