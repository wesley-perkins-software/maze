/**
 * Maze Generator — Growing Tree + Dead-End Braiding
 *
 * Generation happens in three phases:
 *
 *   1. Entry/exit placement: deterministic from seed. Two modes:
 *
 *      Legacy mode (anyPortalSide not set):
 *        Opposite perimeter sides (left↔right or top↔bottom), offset and
 *        away from corners. Breaks directional heuristics.
 *
 *      Any-side mode (anyPortalSide: true):
 *        Entry and exit are independently drawn from all four sides. A
 *        separate entropy RNG (derived from the same seed) handles position
 *        selection so the carving RNG state is untouched — maze structure
 *        stays identical for the same seed regardless of how many retry
 *        attempts the quality gate makes. A quality gate (minimum solution
 *        path length as a fraction of total cells) rejects poor pairs. Up
 *        to 20 position retries on the same carved maze, then up to 5 full
 *        maze retries, keeping the best candidate so generation never fails.
 *
 *   2. Growing Tree carve: seeds from a start cell. A single parameter
 *      `newestBias` (0=Prim's-like high branching, 1=DFS-like corridors)
 *      controls the structural character.
 *
 *   3. Dead-end braid pass: opens a wall at a fraction of dead ends to create
 *      loops specifically where players would get stuck.
 *
 * Tier parameters (newestBias / braidFactor):
 *   small:  0.75 / 0.02  — natural winding corridors, occasional dead ends
 *   medium: 0.80 / 0.01  — longer committed paths, sparse junctions
 *   large:  0.85 / 0.01  — deep dead ends, near-perfect, classic DFS feel
 */
import type { Difficulty, MazeData, MazeGrid, Point } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { createPRNG, shuffle, randomInt } from './prng';
import { pointToIndex, inBounds, removeWall, DIRECTIONS } from './utils';
import { solveMaze } from './solver';
import type { Side } from './quality';
import { scoreMetrics, computeFullScore, computeLightScore, sameSideDepthGate } from './quality';

type TierConfig = {
  newestBias: number;
  braidFactor: number;
};

const TIER_CONFIG: Record<Difficulty, TierConfig> = {
  small:  { newestBias: 0.75, braidFactor: 0.02 },
  medium: { newestBias: 0.80, braidFactor: 0.01 },
  large:  { newestBias: 0.85, braidFactor: 0.01 },
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
  /**
   * Enable any-side entry/exit with quality gating.
   * When true, entry and exit are independently drawn from all four perimeter
   * sides. A separate entropy RNG (seed ^ ENTROPY_XOR) handles position
   * selection so the carving seed state is unaffected.
   * Use for the Maze Generator page. Do not set for Daily Maze or Library.
   */
  anyPortalSide?: boolean;
  /**
   * Use lighter scoring (path length + turn count only) with a lower
   * acceptance threshold. Set for live custom-size slider preview only.
   * Full composite scoring applies for all explicit "Generate New Maze" calls.
   */
  lightMode?: boolean;
};

// ── Any-side mode constants ───────────────────────────────────────────────────

/** XOR constant for deriving the entropy RNG from the maze seed. */
const ENTROPY_XOR = 0x9e3779b9;

/** Prime multiplier for deriving retry maze seeds. */
const MAZE_RETRY_PRIME = 0x9e3779b9;

const MAX_POSITION_RETRIES = 20;
const MAX_MAZE_RETRIES = 5;

/** Minimum distinct 4×4 zones the solution must visit for same-side pairs. */
const SAME_SIDE_MIN_ZONES = 6;

// ── Public entry point ────────────────────────────────────────────────────────

export function generateMaze(options: GeneratorOptions): MazeData {
  const { width, height, difficulty } = options;
  const seed = options.seed ?? (Date.now() & 0xffffffff);

  const cfg = TIER_CONFIG[difficulty];
  const newestBias  = options.newestBias  ?? cfg.newestBias;
  const braidFactor = options.braidFactor ?? cfg.braidFactor;

  // Explicit entry/exit overrides bypass all placement and quality logic.
  if (options.entry !== undefined && options.exit !== undefined) {
    const rng = createPRNG(seed);
    const { entry, exit } = options;
    const grid = carveMazeGrid(entry, width, height, newestBias, braidFactor, rng);
    return finaliseMaze(grid, entry, exit, width, height, difficulty, seed);
  }

  if (options.anyPortalSide) {
    return generateWithAnySidePortals(
      width, height, difficulty, seed, newestBias, braidFactor,
      options.lightMode ?? false,
    );
  }

  // ── Legacy mode: opposite-side entry/exit, no quality gate ───────────────
  const rng = createPRNG(seed);
  const { entry, exit } = placeEntryExit(width, height, rng);
  const grid = carveMazeGrid(entry, width, height, newestBias, braidFactor, rng);
  return finaliseMaze(grid, entry, exit, width, height, difficulty, seed);
}

// ── Any-side generation ───────────────────────────────────────────────────────

function generateWithAnySidePortals(
  width: number,
  height: number,
  difficulty: Difficulty,
  seed: number,
  newestBias: number,
  braidFactor: number,
  lightMode: boolean,
): MazeData {
  const totalCells = width * height;
  // Path-length hard gate: fast pre-filter before computing metrics.
  const minPath = Math.floor(minPathFraction(totalCells) * totalCells);
  // Composite score threshold — conservative to avoid exhausting retries.
  const compositeThreshold = lightMode ? 0.35 : 0.45;

  const sides = validSides(width, height);

  // Carve always starts from the maze center — decoupled from entry/exit so
  // multiple position pairs can be scored on the same structural maze.
  const centerCell: Point = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Separate entropy RNG for portal selection. Derived from the same seed so
  // results are deterministic, but never touches the carving RNG state.
  const entropyRng = createPRNG(seed ^ ENTROPY_XOR);

  type Candidate = { grid: MazeGrid; entry: Point; exit: Point; solution: number[]; mazeSeed: number; compositeScore: number };

  // Primary: passed path gate + same-side gates (if applicable), ranked by composite score.
  let bestPrimary: Candidate | null = null;
  let bestPrimaryScore = -1;
  // Fallback: any valid candidate, ranked by path length (used only if no primary found).
  let bestFallback: Candidate | null = null;
  let bestFallbackPathLen = -1;

  let totalAttempts = 0;

  outer: for (let mazeAttempt = 0; mazeAttempt <= MAX_MAZE_RETRIES; mazeAttempt++) {
    const mazeSeed = mazeAttempt === 0
      ? seed
      : ((seed + mazeAttempt * MAZE_RETRY_PRIME) >>> 0);

    const mazeRng  = createPRNG(mazeSeed);
    const baseGrid = carveMazeGrid(centerCell, width, height, newestBias, braidFactor, mazeRng);

    for (let posAttempt = 0; posAttempt < MAX_POSITION_RETRIES; posAttempt++) {
      totalAttempts++;

      const entrySide = sides[randomInt(entropyRng, sides.length)] as Side;
      const exitSide  = sides[randomInt(entropyRng, sides.length)] as Side;
      const entry     = pickPositionOnSide(entrySide, width, height, entropyRng);
      const exit      = pickPositionOnSide(exitSide,  width, height, entropyRng);

      // Pre-filter same-side pairs that are too close together.
      if (entrySide === exitSide) {
        const sep    = Math.abs(entry.x - exit.x) + Math.abs(entry.y - exit.y);
        const minSep = Math.max(3, Math.floor(sideLength(entrySide, width, height) * 0.25));
        if (sep < minSep) continue;
      }

      // Score by solving. Perimeter gaps are not yet open — BFS navigates
      // through internal passages only and is unaffected.
      const tempMaze: MazeData = {
        id: '', slug: '', difficulty, width, height, seed: mazeSeed,
        entry, exit, grid: baseGrid, solution: [],
        generatedAt: '',
      };
      const sol = solveMaze(tempMaze);

      // Always track as fallback regardless of quality gates.
      if (sol.length > bestFallbackPathLen) {
        bestFallback = { grid: baseGrid, entry, exit, solution: sol, mazeSeed, compositeScore: 0 };
        bestFallbackPathLen = sol.length;
      }

      // Fast path-length gate: skip metric computation for very short paths.
      if (sol.length < minPath) continue;

      const isSameSide = entrySide === exitSide;
      const metrics = scoreMetrics(sol, width, height);

      // Same-side hard gates: shallow paths that never cross the maze interior
      // or fail minimum zone coverage are rejected as primary candidates.
      if (isSameSide) {
        if (!sameSideDepthGate(sol, width, height, entrySide)) continue;
        if (metrics.zoneCount < SAME_SIDE_MIN_ZONES) continue;
      }

      const compositeScore = lightMode
        ? computeLightScore(metrics, totalCells)
        : computeFullScore(metrics, totalCells);

      if (compositeScore > bestPrimaryScore) {
        bestPrimary = { grid: baseGrid, entry, exit, solution: sol, mazeSeed, compositeScore };
        bestPrimaryScore = compositeScore;
      }

      if (compositeScore >= compositeThreshold) break outer;
    }
  }

  // Use best primary candidate; fall back to longest path if no primary found.
  const chosen = (bestPrimary ?? bestFallback)!;

  // Clone the grid before opening perimeter gaps so the scoring grid is not mutated.
  const finalGrid = chosen.grid.slice();
  finalGrid[pointToIndex(chosen.entry, width)] &= ~perimeterWall(chosen.entry, width, height);
  finalGrid[pointToIndex(chosen.exit,  width)] &= ~perimeterWall(chosen.exit,  width, height);

  const partial: MazeData = {
    id: '', slug: '',
    difficulty, width, height,
    seed: chosen.mazeSeed,
    entry: chosen.entry,
    exit:  chosen.exit,
    grid:  finalGrid,
    solution: [],
    generatedAt: new Date().toISOString(),
  };

  partial.solution = solveMaze(partial);

  const finalMetrics = scoreMetrics(partial.solution, width, height);
  const pct = ((partial.solution.length / totalCells) * 100).toFixed(1);
  console.log(
    `[maze] ${width}×${height} ${difficulty} seed=${partial.seed} ` +
    `entry=(${partial.entry.x},${partial.entry.y}) exit=(${partial.exit.x},${partial.exit.y}) ` +
    `solution=${partial.solution.length}/${totalCells} (${pct}%) ` +
    `turns=${finalMetrics.turnCount} zones=${finalMetrics.zoneCount}/16 ` +
    `border=${(finalMetrics.borderFraction * 100).toFixed(0)}% ` +
    `score=${chosen.compositeScore.toFixed(3)} threshold=${compositeThreshold} ` +
    `attempts=${totalAttempts}${lightMode ? ' [light]' : ''}`,
  );

  return partial;
}

// ── Quality helpers ───────────────────────────────────────────────────────────

/**
 * Minimum acceptable solution path length as a fraction of total cells.
 *
 * These are aspirational targets: the retry loop tries to meet them, but the
 * best candidate is used as a fallback if no pair qualifies. Thresholds are
 * calibrated against observed outputs from the center-start Growing Tree
 * algorithm — higher targets cause near-constant fallback exhaustion with no
 * quality benefit.
 */
function minPathFraction(totalCells: number): number {
  if (totalCells <= 400)   return 0.22; // ≤ 20×20:  ~88 cells
  if (totalCells <= 1600)  return 0.16; // ≤ 40×40: ~256 cells
  if (totalCells <= 3600)  return 0.11; // ≤ 60×60: ~396 cells
  if (totalCells <= 6400)  return 0.09; // ≤ 80×80: ~576 cells
  return 0.07;                          //   100×100+: ~700 cells
}

// ── Side / position helpers ───────────────────────────────────────────────────

/** Returns which sides have at least one non-corner cell available. */
function validSides(width: number, height: number): Side[] {
  const out: Side[] = [];
  if (width  >= 3) out.push(0, 2); // top, bottom
  if (height >= 3) out.push(1, 3); // right, left
  // Degenerate case (2×2 or smaller): accept all sides with position clamped.
  return out.length > 0 ? out : [0, 1, 2, 3];
}

function sideLength(side: Side, width: number, height: number): number {
  return side === 0 || side === 2 ? width : height;
}

/**
 * Pick a non-corner boundary cell on the given side.
 * Positions are drawn from [1, N-2] where N is the side length.
 */
function pickPositionOnSide(
  side: Side,
  width: number,
  height: number,
  rng: () => number,
): Point {
  const range = (n: number) => 1 + randomInt(rng, Math.max(1, n - 2));
  switch (side) {
    case 0: return { x: range(width),  y: 0           }; // top
    case 1: return { x: width - 1,     y: range(height) }; // right
    case 2: return { x: range(width),  y: height - 1  }; // bottom
    default:return { x: 0,             y: range(height) }; // left
  }
}

// ── Core maze carving ─────────────────────────────────────────────────────────

/**
 * Growing Tree carve starting from `startCell`, followed by dead-end braid.
 * Returns the raw grid with no perimeter gaps opened.
 */
function carveMazeGrid(
  startCell: Point,
  width: number,
  height: number,
  newestBias: number,
  braidFactor: number,
  rng: () => number,
): MazeGrid {
  const grid: MazeGrid = new Array(width * height).fill(WALL_N | WALL_E | WALL_S | WALL_W);

  const visited = new Uint8Array(width * height);
  const active: number[] = [pointToIndex(startCell, width)];
  visited[active[0]] = 1;

  while (active.length > 0) {
    const idx =
      rng() < newestBias
        ? active.length - 1
        : randomInt(rng, active.length);

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

    if (!carved) active.splice(idx, 1);
  }

  // Dead-end braid pass
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

  return grid;
}

// ── Maze assembly ─────────────────────────────────────────────────────────────

/**
 * Open perimeter gaps for entry/exit, build MazeData, solve, and log.
 * Used by legacy mode and by the explicit-override path.
 */
function finaliseMaze(
  grid: MazeGrid,
  entry: Point,
  exit: Point,
  width: number,
  height: number,
  difficulty: Difficulty,
  seed: number,
): MazeData {
  grid[pointToIndex(entry, width)] &= ~perimeterWall(entry, width, height);
  grid[pointToIndex(exit,  width)] &= ~perimeterWall(exit,  width, height);

  const partial: MazeData = {
    id: '', slug: '',
    difficulty, width, height, seed,
    entry, exit, grid,
    solution: [],
    generatedAt: new Date().toISOString(),
  };

  partial.solution = solveMaze(partial);

  const manhattan = Math.abs(exit.x - entry.x) + Math.abs(exit.y - entry.y);
  const windiness  = partial.solution.length / Math.max(1, manhattan);
  console.log(
    `[maze] ${width}×${height} ${difficulty} seed=${seed} ` +
    `entry=(${entry.x},${entry.y}) exit=(${exit.x},${exit.y}) ` +
    `solution=${partial.solution.length} manhattan=${manhattan} windiness=${windiness.toFixed(2)}`,
  );

  return partial;
}

// ── Legacy entry/exit placement ───────────────────────────────────────────────

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
 *   - Entry and exit are always on opposite sides
 *   - They are always ≥ 30% of the dimension apart
 *   - Neither is at a corner (20–80% range keeps them off the outermost cells)
 */
function placeEntryExit(
  width: number,
  height: number,
  rng: () => number,
): { entry: Point; exit: Point } {
  const horizontal = rng() < 0.5;
  const entryInLow = rng() < 0.5;

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

// ── Shared helpers ────────────────────────────────────────────────────────────

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
    // anyPortalSide intentionally not set — catalog uses legacy opposite-side behaviour.
  });
  maze.id   = entry.slug;
  maze.slug = entry.slug;
  return maze;
}
