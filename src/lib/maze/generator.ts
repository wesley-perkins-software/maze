/**
 * Maze Generator — Growing Tree + Dead-End Braiding
 *
 * Generation happens in two phases:
 *
 *   1. Growing Tree carve: a generalisation of DFS and Prim's algorithm.
 *      A single parameter `newestBias` (0–1) controls the mix:
 *        1.0 → identical to DFS (river / corridor effect, low branching)
 *        0.0 → identical to Prim's (uniform, high branching)
 *      Tiers use lower newestBias as grids grow, so larger mazes branch more.
 *
 *   2. Dead-end braid pass: after carving, every dead-end cell (exactly one
 *      open passage) has its one remaining closed wall opened with probability
 *      `braidFactor`. This creates loops specifically where players would
 *      otherwise hit a wall and backtrack — far more useful than random wall
 *      removal, which scatters loops with no regard for player experience.
 *
 * Tier parameters:
 *   small:  newestBias=0.50, braidFactor=0.10  (20×20)
 *   medium: newestBias=0.30, braidFactor=0.22  (40×40)
 *   large:  newestBias=0.15, braidFactor=0.32  (60×60)
 */
import type { Difficulty, MazeData, MazeGrid, Point } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { createPRNG, shuffle, randomInt } from './prng';
import { pointToIndex, indexToPoint, inBounds, removeWall, DIRECTIONS } from './utils';
import { solveMaze } from './solver';

type TierConfig = {
  newestBias: number;  // 0 = Prim's-like, 1 = DFS-like
  braidFactor: number; // fraction of dead ends to open (0–1)
};

const TIER_CONFIG: Record<Difficulty, TierConfig> = {
  small:  { newestBias: 0.50, braidFactor: 0.10 },
  medium: { newestBias: 0.30, braidFactor: 0.22 },
  large:  { newestBias: 0.15, braidFactor: 0.32 },
};

export type GeneratorOptions = {
  width: number;
  height: number;
  difficulty: Difficulty;
  seed?: number;
  entry?: Point;
  exit?: Point;
  /** Override newestBias directly (for the custom-size generator). */
  newestBias?: number;
  /** Override braidFactor directly (for the custom-size generator). */
  braidFactor?: number;
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

  const cfg = TIER_CONFIG[difficulty];
  const newestBias  = options.newestBias  ?? cfg.newestBias;
  const braidFactor = options.braidFactor ?? cfg.braidFactor;

  // All walls present initially (N|E|S|W = 15)
  const grid: MazeGrid = new Array(width * height).fill(
    WALL_N | WALL_E | WALL_S | WALL_W,
  );

  // ── Phase 1: Growing Tree carve ───────────────────────────────────────────
  //
  // Maintain a list of "active" cells. On each step, pick a cell by mixing
  // "the most recently added" (DFS) with "a uniformly random one" (Prim's).
  // newestBias=1 → always pick newest (DFS); newestBias=0 → always random.
  const visited = new Uint8Array(width * height);
  const active: number[] = [pointToIndex(entry, width)];
  visited[active[0]] = 1;

  while (active.length > 0) {
    // Choose which cell to extend
    const idx =
      rng() < newestBias
        ? active.length - 1            // newest (DFS-like)
        : randomInt(rng, active.length); // random (Prim's-like)

    const ci = active[idx];
    const cx = ci % width;
    const cy = Math.floor(ci / width);

    const dirs = shuffle([0, 1, 2, 3], rng);
    let carved = false;

    for (const di of dirs) {
      const { dx, dy } = DIRECTIONS[di];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds({ x: nx, y: ny }, width, height)) continue;
      const ni = ny * width + nx;
      if (visited[ni]) continue;

      removeWall(grid, { x: cx, y: cy }, { x: nx, y: ny }, width);
      visited[ni] = 1;
      active.push(ni);
      carved = true;
      break;
    }

    if (!carved) {
      // No unvisited neighbours — remove this cell from active list
      active.splice(idx, 1);
    }
  }

  // ── Phase 2: Dead-end braid pass ──────────────────────────────────────────
  //
  // Count open passages per cell. Dead ends have exactly 1 open passage
  // (the one that connects them to the rest of the maze). For each dead end,
  // with probability braidFactor, open one of its remaining closed walls —
  // choosing the neighbour that shares the fewest open passages (to prefer
  // connecting dead ends to dense corridor areas, not other dead ends).
  if (braidFactor > 0) {
    const deadEnds: number[] = [];
    for (let i = 0; i < width * height; i++) {
      if (countPassages(grid[i]) === 1) deadEnds.push(i);
    }

    shuffle(deadEnds, rng);

    for (const ci of deadEnds) {
      if (rng() >= braidFactor) continue;
      if (countPassages(grid[ci]) !== 1) continue; // may have changed

      const cx = ci % width;
      const cy = Math.floor(ci / width);

      // Collect walls that are still present (excluding border walls that
      // would open the perimeter)
      const closedNeighbours: Array<{ di: number; ni: number; passages: number }> = [];
      for (let di = 0; di < 4; di++) {
        const { dx, dy, wall } = DIRECTIONS[di];
        if (!(grid[ci] & wall)) continue; // already open
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inBounds({ x: nx, y: ny }, width, height)) continue;
        const ni = ny * width + nx;
        closedNeighbours.push({ di, ni, passages: countPassages(grid[ni]) });
      }

      if (closedNeighbours.length === 0) continue;

      // Prefer neighbour with the most passages (most connected) — avoids
      // chaining two dead ends together which wastes the braid budget
      closedNeighbours.sort((a, b) => b.passages - a.passages);
      const { di } = closedNeighbours[0];
      const { dx, dy } = DIRECTIONS[di];
      removeWall(grid, { x: cx, y: cy }, { x: cx + dx, y: cy + dy }, width);
    }
  }

  // ── Open entry and exit ──────────────────────────────────────────────────────
  const entryIdx = pointToIndex(entry, width);
  grid[entryIdx] &= ~WALL_N;

  const exitIdx = pointToIndex(exit, width);
  grid[exitIdx] &= ~WALL_S;

  // ── Build MazeData ───────────────────────────────────────────────────────────
  const partial: MazeData = {
    id: '',
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

function countPassages(cell: number): number {
  let n = 0;
  if (!(cell & WALL_N)) n++;
  if (!(cell & WALL_E)) n++;
  if (!(cell & WALL_S)) n++;
  if (!(cell & WALL_W)) n++;
  return n;
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
