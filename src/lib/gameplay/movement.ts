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

const INWARD_DIR_BY_SIDE = {
  top: 'S',
  right: 'W',
  bottom: 'N',
  left: 'E',
} as const satisfies Record<string, Direction>;

const OUTWARD_DIR_BY_SIDE = {
  top: 'N',
  right: 'E',
  bottom: 'S',
  left: 'W',
} as const satisfies Record<string, Direction>;

function getMarkerPosition(maze: MazeData, point: Point): Point {
  if (point.y === 0) return { x: point.x, y: -1 };
  if (point.y === maze.height - 1) return { x: point.x, y: maze.height };
  if (point.x === 0) return { x: -1, y: point.y };
  return { x: maze.width, y: point.y };
}

/** Returns the virtual starting marker position just outside the entry gap. */
export function getEntryStartPosition(maze: MazeData): Point {
  return getMarkerPosition(maze, maze.entry);
}

/** Returns the virtual ending marker position just outside the exit gap. */
export function getExitEndPosition(maze: MazeData): Point {
  return getMarkerPosition(maze, maze.exit);
}

/** Returns the direction that moves from the start marker into the entry cell. */
export function getEntryDirection(maze: MazeData): Direction {
  const { entry } = maze;
  if (entry.y === 0) return INWARD_DIR_BY_SIDE.top;
  if (entry.y === maze.height - 1) return INWARD_DIR_BY_SIDE.bottom;
  if (entry.x === 0) return INWARD_DIR_BY_SIDE.left;
  return INWARD_DIR_BY_SIDE.right;
}

/** Returns the direction that moves from the exit cell onto the flag marker. */
export function getExitDirection(maze: MazeData): Direction {
  const { exit } = maze;
  if (exit.y === 0) return OUTWARD_DIR_BY_SIDE.top;
  if (exit.y === maze.height - 1) return OUTWARD_DIR_BY_SIDE.bottom;
  if (exit.x === 0) return OUTWARD_DIR_BY_SIDE.left;
  return OUTWARD_DIR_BY_SIDE.right;
}

/** Returns true when `from` is the start marker and `direction` enters the maze. */
export function isEntryStep(maze: MazeData, from: Point, direction: Direction): boolean {
  const start = getEntryStartPosition(maze);
  return from.x === start.x && from.y === start.y && direction === getEntryDirection(maze);
}

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
  if (from.x < 0 || from.y < 0 || from.x >= maze.width || from.y >= maze.height) {
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

/**
 * Returns true when the player is standing at the exit cell and moving in the
 * direction of the open perimeter gap — the deliberate final step onto the flag.
 *
 * canMove() blocks this move (destination is out of bounds), so callers must
 * check isExitStep() before canMove() to allow the solve to trigger.
 */
export function isExitStep(maze: MazeData, from: Point, direction: Direction): boolean {
  if (from.x !== maze.exit.x || from.y !== maze.exit.y) return false;
  if (direction !== getExitDirection(maze)) return false;
  const { dx, dy } = DIR_DELTA[direction];
  const destX = from.x + dx;
  const destY = from.y + dy;
  if (destX >= 0 && destY >= 0 && destX < maze.width && destY < maze.height) return false;
  return !(maze.grid[pointToIndex(from, maze.width)] & DIR_WALL[direction]);
}

/**
 * Walks from `from` toward `target` in a straight line (same row or column),
 * stopping at the first wall or when `target` is reached.
 *
 * Returns the cells entered (not including `from`), or an empty array if the
 * first step is blocked. Returns null if `target` is diagonal — the caller
 * should fall back to directional RUN behavior.
 */
export function computeTapPath(maze: MazeData, from: Point, target: Point): Point[] | null {
  if (from.x === target.x && from.y === target.y) return [];

  let direction: Direction;
  if (from.y === target.y) {
    direction = target.x > from.x ? 'E' : 'W';
  } else if (from.x === target.x) {
    direction = target.y > from.y ? 'S' : 'N';
  } else {
    return null;
  }

  const path: Point[] = [];
  let pos = from;

  while (canMove(maze, pos, direction)) {
    pos = applyMove(pos, direction);
    path.push({ ...pos });
    if (pos.x === target.x && pos.y === target.y) break;
    if (pos.x === maze.exit.x && pos.y === maze.exit.y) break;
  }

  return path;
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

  if (isEntryStep(maze, pos, direction)) {
    pos = { ...maze.entry };
    path.push({ ...pos });

    if (pos.x === maze.exit.x && pos.y === maze.exit.y) return path;

    const isJunction = ALL_DIRS
      .filter(d => d !== direction && d !== back)
      .some(d => canMove(maze, pos, d));
    if (isJunction) return path;
  }

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
