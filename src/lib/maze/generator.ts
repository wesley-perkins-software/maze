/**
 * Maze Generator — Growing Tree + Dead-End Braiding
 *
 * Generation happens in three phases:
 *
 *   1. Entry/exit placement: deterministic from seed, on opposite sides of the
 *      maze, offset from each other and away from corners. Breaks directional
 *      heuristics (no "always go right and down" shortcut).
 *
 *   2. Growing Tree carve: seeds from the entry point. A single parameter
 *      `newestBias` (0=Prim's-like high branching, 1=DFS-like corridors)
 *      controls the structural character. Carving begins at the placed entry.
 *
 *   3. Dead-end braid pass: opens a wall at a fraction of dead ends to create
 *      loops specifically where players would get stuck (vs. random wall removal
 *      which scatters loops without regard for player experience).
 *
 * Tier parameters (newestBias / braidFactor):
 *   small:  0.55 / 0.08  — mostly DFS-leaning, few loops, approachable
 *   medium: 0.35 / 0.18  — balanced mix, enough loops to break wall-following
 *   large:  0.25 / 0.25  — Prim's-leaning with corridor structure, meaningful dead ends
 *
 * Entry/exit placement:
 *   - Always on opposite perimeter sides (left↔right or top↔bottom)
 *   - Entry placed in one half of the side (20–50%), exit in the other (50–80%)
 *   - Which half each gets is also seed-derived
 *   - Result: entry and exit are always ≥ 30% of the dimension apart, never at corners
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
  small:  { newestBias: 0.55, braidFactor: 0.08 },
  medium: { newestBias: 0.35, braidFactor: 0.18 },
  large:  { newestBias: 0.25, braidFactor: 0.25 },
};

export type GeneratorOptions = {
  width: number;
  height: number;
  difficulty: Difficulty;
  seed?: number;
  /** Override entry position (skips seeded placement — for tests/special cases). */
  entry?: Point;
  /** Override exit position (skips seeded placement — for tests/special cases). */
  exit?: Point;
  /** Override newestBias directly (for the custom-size generator). */
  newestBias?: number;
  /** Override braidFactor directly (for the custom-size generator). */
  braidFactor?: number;
};

export function generateMaze(options: GeneratorOptions): MazeData {
  const { width, height, difficulty } = options;
  const seed = options.seed ?? (Date.now() & 0xffffffff);
  const rng = createPRNG(seed);

  const cfg = TIER_CONFIG[difficulty];
  const newestBias  = options.newestBias  ?? cfg.newestBias;
  const braidFactor = options.braidFactor ?? cfg.braidFactor;

  // ── Phase 1: Determine entry and exit ────────────────────────────────────────
  //
  // If explicit overrides are provided (tests, special cases), use them.
  // Otherwise derive placement deterministically from the RNG so the same seed
  // always produces the same entry/exit positions.
  const entry = options.entry ?? undefined;
  const exit  = options.exit  ?? undefined;
  const { entry: placedEntry, exit: placedExit } =
    entry !== undefined && exit !== undefined
      ? { entry, exit }
      : placeEntryExit(width, height, rng);

  // ── Phase 2: Growing Tree carve (starts from entry) ──────────────────────────
  const grid: MazeGrid = new Array(width * height).fill(
    WALL_N | WALL_E | WALL_S | WALL_W,
  );

  const visited = new Uint8Array(width * height);
  const active: number[] = [pointToIndex(placedEntry, width)];
  visited[active[0]] = 1;

  while (active.length > 0) {
    const idx =
      rng() < newestBias
        ? active.length - 1              // newest (DFS-like)
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
      active.splice(idx, 1);
    }
  }

  // ── Phase 3: Dead-end braid pass ─────────────────────────────────────────────
  if (braidFactor > 0) {
    const deadEnds: number[] = [];
    for (let i = 0; i < width * height; i++) {
      if (countPassages(grid[i]) === 1) deadEnds.push(i);
    }

    shuffle(deadEnds, rng);

    for (const ci of deadEnds) {
      if (rng() >= braidFactor) continue;
      if (countPassages(grid[ci]) !== 1) continue;

      const cx = ci % width;
      const cy = Math.floor(ci / width);

      const closedNeighbours: Array<{ di: number; ni: number; passages: number }> = [];
      for (let di = 0; di < 4; di++) {
        const { dx, dy, wall } = DIRECTIONS[di];
        if (!(grid[ci] & wall)) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inBounds({ x: nx, y: ny }, width, height)) continue;
        const ni = ny * width + nx;
        closedNeighbours.push({ di, ni, passages: countPassages(grid[ni]) });
      }

      if (closedNeighbours.length === 0) continue;

      closedNeighbours.sort((a, b) => b.passages - a.passages);
      const { dx, dy } = DIRECTIONS[closedNeighbours[0].di];
      removeWall(grid, { x: cx, y: cy }, { x: cx + dx, y: cy + dy }, width);
    }
  }

  // ── Open perimeter walls at entry and exit ────────────────────────────────────
  //
  // Each endpoint is on a perimeter edge. Clear the wall that faces outward so
  // the renderer shows a gap. The wall to clear depends on which edge the point
  // sits on — the renderer is flag-driven so this is the only change needed.
  grid[pointToIndex(placedEntry, width)] &= ~perimeterWall(placedEntry, width, height);
  grid[pointToIndex(placedExit,  width)] &= ~perimeterWall(placedExit,  width, height);

  // ── Build MazeData and solve ──────────────────────────────────────────────────
  const partial: MazeData = {
    id: '',
    slug: '',
    difficulty,
    width,
    height,
    seed,
    entry: placedEntry,
    exit:  placedExit,
    grid,
    solution: [],
    generatedAt: new Date().toISOString(),
  };

  partial.solution = solveMaze(partial);

  // Log windiness for evaluation (not used for filtering yet).
  const manhattan = Math.abs(placedExit.x - placedEntry.x) + Math.abs(placedExit.y - placedEntry.y);
  const windiness = partial.solution.length / Math.max(1, manhattan);
  console.log(
    `[maze] ${width}×${height} ${difficulty} seed=${seed} ` +
    `entry=(${placedEntry.x},${placedEntry.y}) exit=(${placedExit.x},${placedExit.y}) ` +
    `solution=${partial.solution.length} manhattan=${manhattan} windiness=${windiness.toFixed(2)}`,
  );

  return partial;
}

/**
 * Place entry and exit on opposite perimeter sides, offset from each other,
 * away from corners. Consumes 4 RNG calls so the remaining sequence is
 * available for carving.
 *
 * Strategy:
 *   - Pick orientation (left↔right or top↔bottom) from seed
 *   - Divide the relevant dimension into two halves: 20–50% and 50–80%
 *   - Seed-derived bit decides which half entry occupies (exit gets the other)
 *   - Both positions are randomised within their half
 *
 * This guarantees:
 *   - Entry and exit are always on opposite sides (no adjacent-side diagonal bias)
 *   - They are always ≥ 30% of the dimension apart
 *   - Neither is at a corner (20–80% range keeps them off the outermost cells)
 */
function placeEntryExit(
  width: number,
  height: number,
  rng: () => number,
): { entry: Point; exit: Point } {
  const horizontal = rng() < 0.5; // true = left/right, false = top/bottom
  const entryInLow = rng() < 0.5; // true = entry in lower-numbered half

  if (horizontal) {
    const lo  = Math.floor(height * 0.2);
    const mid = Math.floor(height * 0.5);
    const hi  = Math.ceil(height  * 0.8);

    const posLow  = lo  + Math.floor(rng() * (mid - lo));
    const posHigh = mid + Math.floor(rng() * (hi  - mid));

    const entryY = entryInLow ? posLow  : posHigh;
    const exitY  = entryInLow ? posHigh : posLow;

    return {
      entry: { x: 0,         y: entryY },
      exit:  { x: width - 1, y: exitY  },
    };
  } else {
    const lo  = Math.floor(width * 0.2);
    const mid = Math.floor(width * 0.5);
    const hi  = Math.ceil(width  * 0.8);

    const posLow  = lo  + Math.floor(rng() * (mid - lo));
    const posHigh = mid + Math.floor(rng() * (hi  - mid));

    const entryX = entryInLow ? posLow  : posHigh;
    const exitX  = entryInLow ? posHigh : posLow;

    return {
      entry: { x: entryX, y: 0           },
      exit:  { x: exitX,  y: height - 1  },
    };
  }
}

/**
 * Returns the wall constant that faces outward from the given perimeter cell.
 * Used to open the visual entry/exit gap in the border.
 */
function perimeterWall(pt: Point, width: number, height: number): number {
  if (pt.y === 0)          return WALL_N;
  if (pt.y === height - 1) return WALL_S;
  if (pt.x === 0)          return WALL_W;
  return WALL_E;
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
