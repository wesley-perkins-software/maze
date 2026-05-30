/**
 * Maze Generator — Growing Tree + Dead-End Braiding
 *
 * Generation happens in three phases:
 *
 *   1. Entry/exit placement: deterministic from seed. Two modes:
 *
 *      Legacy mode (anyPortalSide not set):
 *        Opposite perimeter sides (left↔right or top↔bottom), offset and
 *        away from corners. Used for catalog / Daily Maze.
 *
 *      Any-side mode (anyPortalSide: true):
 *        Entry and exit are chosen via the two-BFS farthest-pair heuristic:
 *        find the maze diameter endpoints, build a top-K exit pool, and pick
 *        from it with seeded weighted-random selection. A separate entropy RNG
 *        (seed ^ ENTROPY_XOR) drives the selection so the carving RNG state is
 *        untouched — maze structure stays identical for the same seed regardless
 *        of retry attempts. A quality gate (composite score threshold) may
 *        trigger up to MAX_MAZE_RETRIES full recarves. Generation never fails.
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
import { pointToIndex, inBounds, removeWall, DIRECTIONS, getPassages } from './utils';
import { solveMaze } from './solver';
import { scoreMetrics, computeFullScore, computeLightScore } from './quality';

type TierConfig = {
  newestBias: number;
  braidFactor: number;
};

const TIER_CONFIG: Record<Difficulty, TierConfig> = {
  small:   { newestBias: 0.75, braidFactor: 0.02 }, // approachable — keep as-is
  medium:  { newestBias: 1.00, braidFactor: 0.00 }, // pure DFS, perfect maze
  large:   { newestBias: 1.00, braidFactor: 0.00 }, // pure DFS, perfect maze
  expert:  { newestBias: 1.00, braidFactor: 0.00 }, // pure DFS — deep corridors, 80×80
  hardcore: { newestBias: 1.00, braidFactor: 0.00 }, // pure DFS — extreme depth, 100×100
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
   * When true, entry and exit are chosen via the farthest-pair heuristic
   * with seeded weighted-random pool selection.
   * Use for the Maze Generator page. Do not set for Daily Maze or Library.
   */
  anyPortalSide?: boolean;
  /**
   * Use lighter scoring (path length + turn count only) with a lower
   * acceptance threshold. Set for live custom-size slider preview only.
   * Full composite scoring applies for all explicit "Generate New Maze" calls.
   */
  lightMode?: boolean;
  /**
   * Experimental: override the carving start cell instead of the default center.
   * For topology experiments only — not for production use.
   */
  experimentalStartCell?: Point;
};

/**
 * Bump this when algorithm changes would produce a structurally different maze
 * from the same seed (making saved trails/positions invalid). Routine fixes that
 * don't change wall topology do NOT require a bump.
 */
export const GENERATOR_VERSION = 1;

// ── Any-side mode constants ───────────────────────────────────────────────────

/** XOR constant for deriving the entropy RNG from the maze seed. */
const ENTROPY_XOR = 0x9e3779b9;

/**
 * XOR constant for deriving the carve-start RNG.
 * Must differ from ENTROPY_XOR so the two RNG streams are independent.
 * Used to place the carving origin at a uniformly-random interior cell,
 * which avoids the structural bias of a fixed center or corner start and
 * produces significantly longer solution paths (D4 variant in topology audit).
 */
const CARVE_START_XOR = 0xf00dcafe;

/** Prime multiplier for deriving retry maze seeds. */
const MAZE_RETRY_PRIME = 0x9e3779b9;

const MAX_MAZE_RETRIES = 5;

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
      options.experimentalStartCell,
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
  experimentalStartCell?: Point,
): MazeData {
  const totalCells = width * height;
  const minPath    = Math.floor(minPathFraction(totalCells) * totalCells);
  // Full mode: 0.78 accepts only quality mazes. Light mode: 0.50 keeps
  // live slider preview responsive.
  const interMazeThreshold = lightMode ? 0.50 : 0.78;

  // Carve start cell. Explicit override wins (experiments / tests). Otherwise:
  //   small — maze center: approachable branchy feel with current newestBias
  //   medium / large — deterministic random interior cell derived from seed:
  //     pure DFS from a random origin produces much longer solution paths
  //     (confirmed by topology audit: +22–27pp path fraction) and avoids
  //     the portal-side bias that a fixed corner start introduces.
  const centerCell: Point = experimentalStartCell ?? (
    difficulty === 'small'
      ? { x: Math.floor(width / 2), y: Math.floor(height / 2) }
      : (() => {
          const rng = createPRNG(seed ^ CARVE_START_XOR);
          const idx = Math.floor(rng() * totalCells);
          return { x: idx % width, y: (idx / width) | 0 };
        })()
  );

  // Separate entropy RNG for portal selection. Derived from the same seed so
  // results are deterministic, but never touches the carving RNG state.
  const entropyRng = createPRNG(seed ^ ENTROPY_XOR);

  type Candidate = {
    grid: MazeGrid; entry: Point; exit: Point;
    solution: number[]; mazeSeed: number; compositeScore: number;
  };

  // Primary: passed path gate + composite threshold; ranked by score.
  let bestPrimary     : Candidate | null = null;
  let bestPrimaryScore = -1;
  // Fallback: any valid candidate, ranked by path length.
  let bestFallback    : Candidate | null = null;
  let bestFallbackPathLen = -1;
  let mazeAttemptsDone = 0;

  outer: for (let mazeAttempt = 0; mazeAttempt <= MAX_MAZE_RETRIES; mazeAttempt++) {
    mazeAttemptsDone++;
    const mazeSeed = mazeAttempt === 0
      ? seed
      : ((seed + mazeAttempt * MAZE_RETRY_PRIME) >>> 0);

    const mazeRng  = createPRNG(mazeSeed);
    const baseGrid = carveMazeGrid(centerCell, width, height, newestBias, braidFactor, mazeRng);

    // Farthest-pair endpoint selection: one near-optimal pair per maze
    // structure, replacing the previous 20-attempt random sampling loop.
    const pair = selectFarthestPairPortals(baseGrid, width, height, entropyRng);
    if (!pair) continue; // degenerate maze — skip

    const { entry, exit } = pair;

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
      bestFallback        = { grid: baseGrid, entry, exit, solution: sol, mazeSeed, compositeScore: 0 };
      bestFallbackPathLen = sol.length;
    }

    // Path-length hard gate: fast pre-filter before metric computation.
    if (sol.length < minPath) continue;

    const metrics        = scoreMetrics(sol, width, height);
    const compositeScore = lightMode
      ? computeLightScore(metrics, totalCells)
      : computeFullScore(metrics, totalCells);

    if (compositeScore > bestPrimaryScore) {
      bestPrimary      = { grid: baseGrid, entry, exit, solution: sol, mazeSeed, compositeScore };
      bestPrimaryScore = compositeScore;
    }

    if (compositeScore >= interMazeThreshold) break outer;
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

  if (import.meta.env?.DEV) {
    const finalMetrics = scoreMetrics(partial.solution, width, height);
    const pct = ((partial.solution.length / totalCells) * 100).toFixed(1);
    console.log(
      `[maze] ${width}×${height} ${difficulty} seed=${partial.seed} ` +
      `entry=(${partial.entry.x},${partial.entry.y}) exit=(${partial.exit.x},${partial.exit.y}) ` +
      `solution=${partial.solution.length}/${totalCells} (${pct}%) ` +
      `turns=${finalMetrics.turnCount} zones=${finalMetrics.zoneCount}/16 ` +
      `span=${finalMetrics.minSpan.toFixed(2)} border=${(finalMetrics.borderFraction * 100).toFixed(0)}% ` +
      `score=${chosen.compositeScore.toFixed(3)} threshold=${interMazeThreshold} ` +
      `structureAttempts=${mazeAttemptsDone}${lightMode ? ' [light]' : ''}`,
    );
  }

  return partial;
}

// ── Quality helpers ───────────────────────────────────────────────────────────

/**
 * Minimum acceptable solution path length as a fraction of total cells.
 * Used as a fast pre-filter before computing the full composite score.
 * These are conservative lower bounds — the composite quality gate (refPath
 * in quality.ts) is calibrated to the observed p50 and is the real filter.
 */
function minPathFraction(totalCells: number): number {
  if (totalCells <= 400)   return 0.22; // ≤ 20×20:  ~88 cells
  if (totalCells <= 1600)  return 0.16; // ≤ 40×40: ~256 cells
  if (totalCells <= 3600)  return 0.11; // ≤ 60×60: ~396 cells
  if (totalCells <= 6400)  return 0.09; // ≤ 80×80: ~576 cells
  return 0.07;                          //   100×100+: ~700 cells
}

// ── BFS distance map ──────────────────────────────────────────────────────────

/**
 * BFS from startIdx through open passages. Returns a flat Int32Array of
 * distances; −1 = unreachable (cannot occur in a connected maze).
 */
function bfsAllDistances(
  grid: MazeGrid,
  startIdx: number,
  width: number,
  height: number,
): Int32Array {
  const total = width * height;
  const dist  = new Int32Array(total).fill(-1);
  dist[startIdx] = 0;
  const queue: number[] = [startIdx];
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++];
    const x  = ci % width;
    const y  = (ci / width) | 0;
    for (const nb of getPassages(grid, { x, y }, width, height)) {
      const ni = nb.y * width + nb.x;
      if (dist[ni] === -1) {
        dist[ni] = dist[ci] + 1;
        queue.push(ni);
      }
    }
  }
  return dist;
}

// ── Perimeter helpers ─────────────────────────────────────────────────────────

/**
 * All non-corner perimeter cells as flat indices.
 * Matches the [1, N-2] convention used throughout the codebase.
 */
function collectPerimeterCandidates(width: number, height: number): number[] {
  const cells: number[] = [];
  for (let x = 1; x < width - 1; x++) {
    cells.push(x);                          // top row    (y = 0)
    cells.push((height - 1) * width + x);  // bottom row (y = height−1)
  }
  for (let y = 1; y < height - 1; y++) {
    cells.push(y * width);                  // left col   (x = 0)
    cells.push(y * width + (width - 1));    // right col  (x = width−1)
  }
  return cells;
}

/** Perimeter side index for a boundary cell: 0=top 1=right 2=bottom 3=left. */
function perimeterSideOf(idx: number, width: number, height: number): number {
  const x = idx % width;
  const y = (idx / width) | 0;
  if (y === 0)          return 0;
  if (x === width - 1)  return 1;
  if (y === height - 1) return 2;
  return 3;
}

// ── Farthest-pair endpoint selection ─────────────────────────────────────────

/**
 * Select a near-optimal (entry, exit) portal pair using the two-BFS
 * farthest-pair heuristic.
 *
 * Algorithm:
 *   1. BFS from perimeter[0] → find perimeter cell P1 (diameter anchor).
 *   2. BFS from P1 → distances to every cell.
 *   3. Sort perimeter by dist-from-P1; take top K as exit candidate pool.
 *   4. Score each pool cell: graph-distance (primary, 72%) + spatial spread
 *      (secondary, 20%) + different-sides bonus (8%).
 *   5. Weighted-random pick from the top half of the scored pool (weights
 *      ∝ score^1.5). Gives variety without sacrificing quality.
 *   6. Randomly swap entry/exit assignment.
 *
 * The entropyRng drives steps 5 & 6, keeping selection deterministic for a
 * given seed while producing variety across different seeds.
 *
 * Spatial spread uses sum(xSpread, ySpread)/2 rather than min(), so narrow
 * rectangular mazes are not unfairly penalised on their short axis.
 */
function selectFarthestPairPortals(
  grid: MazeGrid,
  width: number,
  height: number,
  entropyRng: () => number,
): { entry: Point; exit: Point } | null {
  const total     = width * height;
  const perimeter = collectPerimeterCandidates(width, height);
  if (perimeter.length < 2) return null;

  // Step 1: BFS from first perimeter cell → farthest perimeter cell P1.
  const dist0   = bfsAllDistances(grid, perimeter[0], width, height);
  let p1Idx     = perimeter[0];
  let p1MaxDist = 0;
  for (const idx of perimeter) {
    if (dist0[idx] > p1MaxDist) { p1MaxDist = dist0[idx]; p1Idx = idx; }
  }

  // Step 2: BFS from P1 → distances from one diameter endpoint.
  const distFromP1 = bfsAllDistances(grid, p1Idx, width, height);

  // Step 3: Sort perimeter by distance from P1 (descending), exclude P1 itself.
  const sorted = perimeter
    .filter(idx => idx !== p1Idx)
    .sort((a, b) => distFromP1[b] - distFromP1[a]);

  if (sorted.length === 0) return null;

  // Step 4 prep: compute P1 coordinates and side — needed for both pool
  // filtering and candidate scoring below.
  const p1x    = p1Idx % width;
  const p1y    = (p1Idx / width) | 0;
  const wDim   = Math.max(1, width  - 1);
  const hDim   = Math.max(1, height - 1);
  const p1Side = perimeterSideOf(p1Idx, width, height);

  // Build exit candidate pool: top 10%, minimum 6, maximum 20.
  const poolSize = Math.min(20, Math.max(6, Math.ceil(sorted.length * 0.10)));

  // Prefer to exclude same-side cells that are too close to P1 in coordinate
  // space — visually adjacent portals on the same wall feel unintentional even
  // when the graph distance is long. Filter before slicing the pool, but fall
  // back to unfiltered if too few candidates survive.
  const p1IsHoriz   = p1Side === 0 || p1Side === 2;
  const p1Coord     = p1IsHoriz ? p1x : p1y;
  const sideDim     = p1IsHoriz ? width : height;
  const minSepCoord = Math.max(3, Math.floor(sideDim * 0.25));

  const preferred = sorted.filter(idx => {
    if (perimeterSideOf(idx, width, height) !== p1Side) return true;
    const coord = p1IsHoriz ? (idx % width) : ((idx / width) | 0);
    return Math.abs(coord - p1Coord) >= minSepCoord;
  });

  const poolSource = preferred.length >= 2 ? preferred : sorted;
  const pool       = poolSource.slice(0, poolSize);

  const scored = pool.map(exitIdx => {
    const exitX     = exitIdx % width;
    const exitY     = (exitIdx / width) | 0;
    const graphDist = distFromP1[exitIdx];
    // Spatial spread: sum (not min) so narrow-axis mazes are not penalised.
    const xSpread   = Math.abs(exitX - p1x) / wDim;
    const ySpread   = Math.abs(exitY - p1y) / hDim;
    const spread    = (xSpread + ySpread) * 0.5;
    // Small bonus for endpoints on different perimeter sides.
    const diffSide  = perimeterSideOf(exitIdx, width, height) !== p1Side ? 0.08 : 0;
    return {
      exitIdx,
      score: (graphDist / total) * 0.72 + spread * 0.20 + diffSide,
    };
  });

  // Sort by combined score; take top half as the selection pool.
  scored.sort((a, b) => b.score - a.score);
  const selPool = scored.slice(0, Math.max(3, Math.ceil(scored.length * 0.5)));

  // Step 5: Weighted-random pick; weights ∝ score^1.5 for soft quality bias.
  const weights = selPool.map(c => Math.pow(Math.max(0, c.score), 1.5));
  const totalW  = weights.reduce((s, w) => s + w, 0);
  let r = entropyRng() * totalW;
  let chosenExit = selPool[0].exitIdx;
  for (let i = 0; i < selPool.length; i++) {
    r -= weights[i];
    if (r <= 0) { chosenExit = selPool[i].exitIdx; break; }
  }

  const p1Point  : Point = { x: p1x,               y: p1y };
  const exitPoint: Point = { x: chosenExit % width, y: (chosenExit / width) | 0 };

  // Step 6: Randomly assign which end is entry and which is exit.
  return entropyRng() < 0.5
    ? { entry: p1Point, exit: exitPoint }
    : { entry: exitPoint, exit: p1Point };
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

/**
 * Generate a library maze from a LibraryCatalogEntry.
 * Uses anyPortalSide: true and the current GENERATOR_VERSION for premium quality.
 */
export function generateMazeFromLibraryCatalog(entry: {
  id: string;
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
    anyPortalSide: true,
  });
  maze.id   = entry.id;
  maze.slug = entry.id;
  return maze;
}
