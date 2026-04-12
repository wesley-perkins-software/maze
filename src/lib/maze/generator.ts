/**
 * Maze Generator — Recursive Backtracker (DFS)
 *
 * Produces a perfect maze (every cell reachable, exactly one path between
 * any two cells). Post-processes wall removal to adjust difficulty:
 *
 *   kids:   30% extra walls removed → very open, short paths
 *   easy:   25% extra walls removed
 *   medium: 10% extra walls removed
 *   adults:  5% extra walls removed
 *   hard:    0% extra walls removed → maximum dead ends
 */
import type { Difficulty, MazeData, MazeGrid, Point } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { createPRNG, shuffle, randomInt } from './prng';
import { pointToIndex, indexToPoint, inBounds, removeWall, DIRECTIONS } from './utils';
import { solveMaze } from './solver';

const EXTRA_WALL_REMOVAL: Record<Difficulty, number> = {
  kids:   0.30,
  easy:   0.25,
  medium: 0.10,
  adults: 0.05,
  hard:   0.00,
};

export type GeneratorOptions = {
  width: number;
  height: number;
  difficulty: Difficulty;
  seed?: number;
  entry?: Point;
  exit?: Point;
};

export function generateMaze(options: GeneratorOptions): MazeData {
  const {
    width,
    height,
    difficulty,
    entry = { x: 0, y: 0 },
    exit  = { x: width - 1, y: height - 1 },
  } = options;

  const seed = options.seed ?? (Date.now() & 0xffffffff);
  const rng = createPRNG(seed);

  // All walls present initially (N|E|S|W = 15)
  const grid: MazeGrid = new Array(width * height).fill(
    WALL_N | WALL_E | WALL_S | WALL_W,
  );

  // ── DFS Recursive Backtracker ────────────────────────────────────────────────
  const visited = new Uint8Array(width * height);
  const stack: Point[] = [entry];
  visited[pointToIndex(entry, width)] = 1;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const dirs = shuffle([0, 1, 2, 3], rng);

    let moved = false;
    for (const di of dirs) {
      const { dx, dy } = DIRECTIONS[di];
      const neighbor: Point = { x: current.x + dx, y: current.y + dy };
      if (!inBounds(neighbor, width, height)) continue;
      const ni = pointToIndex(neighbor, width);
      if (visited[ni]) continue;

      removeWall(grid, current, neighbor, width);
      visited[ni] = 1;
      stack.push(neighbor);
      moved = true;
      break;
    }

    if (!moved) {
      stack.pop();
    }
  }

  // ── Extra Wall Removal (difficulty post-processing) ──────────────────────────
  const removalRate = EXTRA_WALL_REMOVAL[difficulty];
  if (removalRate > 0) {
    // Collect all internal walls (avoid borders)
    const candidates: Array<{ from: Point; to: Point }> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from: Point = { x, y };
        const idx = pointToIndex(from, width);
        const cell = grid[idx];

        if (x + 1 < width && (cell & WALL_E)) {
          candidates.push({ from, to: { x: x + 1, y } });
        }
        if (y + 1 < height && (cell & WALL_S)) {
          candidates.push({ from, to: { x, y: y + 1 } });
        }
      }
    }

    shuffle(candidates, rng);
    const count = Math.floor(candidates.length * removalRate);
    for (let i = 0; i < count; i++) {
      removeWall(grid, candidates[i].from, candidates[i].to, width);
    }
  }

  // ── Open entry and exit ──────────────────────────────────────────────────────
  // Entry: open North wall of entry cell (top-left)
  const entryIdx = pointToIndex(entry, width);
  grid[entryIdx] &= ~WALL_N;

  // Exit: open South wall of exit cell (bottom-right)
  const exitIdx = pointToIndex(exit, width);
  grid[exitIdx] &= ~WALL_S;

  // ── Build MazeData ───────────────────────────────────────────────────────────
  const partial: MazeData = {
    id: '', // filled by caller (catalog) or generateSlug
    slug: '',
    difficulty,
    width,
    height,
    seed,
    entry,
    exit,
    grid,
    solution: [],
    generatedAt: new Date().toISOString(),
  };

  partial.solution = solveMaze(partial);

  return partial;
}

/** Generate a maze with its slug already set from catalog entry. */
export function generateMazeFromCatalog(entry: {
  slug: string;
  difficulty: Difficulty;
  width: number;
  height: number;
  seed: number;
}): MazeData {
  const maze = generateMaze({
    width: entry.width,
    height: entry.height,
    difficulty: entry.difficulty,
    seed: entry.seed,
  });
  maze.id = entry.slug;
  maze.slug = entry.slug;
  return maze;
}
