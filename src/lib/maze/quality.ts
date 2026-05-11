/**
 * Maze Quality Metrics — Phase 2
 *
 * Pure functions for scoring solution paths on multiple dimensions.
 * All metrics are computed in a single O(n) pass over the solution array.
 */

/** 0=top  1=right  2=bottom  3=left */
export type Side = 0 | 1 | 2 | 3;

export type SolutionMetrics = {
  pathLength: number;
  /** Direction changes between consecutive steps along the solution. */
  turnCount: number;
  /** Distinct 4×4 grid zones the path visits (0–16). */
  zoneCount: number;
  /** Fraction of path cells within 1 step of any maze edge. */
  borderFraction: number;
  /**
   * min(normalised x-span, normalised y-span) — the bottleneck axis.
   * x-span = (maxX − minX) / (width − 1), y-span = (maxY − minY) / (height − 1).
   * 1.0 = path reaches both edges on the narrower axis; 0 = single cell.
   * Catches "band" paths that span one axis but stay confined on the other.
   */
  minSpan: number;
};

/**
 * Per-size reference values used to normalise score components.
 *
 * refPath: the minimum viable path length (= minPathFraction × totalCells).
 *   A maze at this threshold scores 1.0 on path; longer paths score up to 1.5.
 *
 * refTurns: empirically calibrated to the p50–p75 of observed turn counts
 *   (via scripts/quality-audit.ts). An average maze scores ~1.0; a winding
 *   maze scores higher. Calibrated from a 50–200 maze sample per size.
 */
export function refValues(totalCells: number): { refPath: number; refTurns: number } {
  if (totalCells <= 400)  return { refPath: 88,  refTurns: 60  }; // ≤ 20×20   (audit p50=58, p75=64)
  if (totalCells <= 1600) return { refPath: 256, refTurns: 155 }; // ≤ 40×40   (audit p50=151, p75=165)
  if (totalCells <= 3600) return { refPath: 396, refTurns: 265 }; // ≤ 60×60   (audit p50=259, p75=275)
  if (totalCells <= 6400) return { refPath: 576, refTurns: 370 }; // ≤ 80×80   (audit p50=359, p75=381)
  return                         { refPath: 700, refTurns: 460 }; // 100×100+  (audit p50=454, p75=466)
}

/**
 * Compute all quality metrics in a single O(n) pass over the solution path.
 *
 * - turnCount: direction changes (straight → straight = 0 turns)
 * - zoneCount: distinct 4×4 grid zones visited out of 16 total
 * - borderFraction: fraction of cells within 1 step of any maze edge
 * - minSpan: min(normalised x-span, normalised y-span) — catches band paths
 */
export function scoreMetrics(
  sol: number[],
  width: number,
  height: number,
): SolutionMetrics {
  const pathLength = sol.length;
  if (pathLength < 2) {
    return { pathLength, turnCount: 0, zoneCount: 0, borderFraction: 1, minSpan: 0 };
  }

  const ZONE_ROWS = 4;
  const ZONE_COLS = 4;
  const cellsPerZoneX = width  / ZONE_COLS;
  const cellsPerZoneY = height / ZONE_ROWS;

  const zoneVisited = new Uint8Array(ZONE_ROWS * ZONE_COLS);
  let turns = 0;
  let nearBorderCount = 0;
  let prevDx = 0;
  let prevDy = 0;
  let minX = width,  maxX = 0;
  let minY = height, maxY = 0;

  for (let i = 0; i < pathLength; i++) {
    const idx = sol[i];
    const x = idx % width;
    const y = (idx / width) | 0;

    // Span tracking
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    // Zone coverage (4×4 grid)
    const zx = Math.min((x / cellsPerZoneX) | 0, ZONE_COLS - 1);
    const zy = Math.min((y / cellsPerZoneY) | 0, ZONE_ROWS - 1);
    zoneVisited[zy * ZONE_COLS + zx] = 1;

    // Near-border: within 1 cell of any edge
    if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) {
      nearBorderCount++;
    }

    // Turn count: direction change from previous step
    if (i > 0) {
      const px = sol[i - 1] % width;
      const py = (sol[i - 1] / width) | 0;
      const dx = x - px;
      const dy = y - py;
      if (i > 1 && (dx !== prevDx || dy !== prevDy)) turns++;
      prevDx = dx;
      prevDy = dy;
    }
  }

  let zoneCount = 0;
  for (let z = 0; z < ZONE_ROWS * ZONE_COLS; z++) {
    if (zoneVisited[z]) zoneCount++;
  }

  const xSpan = (maxX - minX) / Math.max(1, width  - 1);
  const ySpan = (maxY - minY) / Math.max(1, height - 1);

  return {
    pathLength,
    turnCount: turns,
    zoneCount,
    borderFraction: nearBorderCount / pathLength,
    minSpan: Math.min(xSpan, ySpan),
  };
}

/**
 * Full composite score for explicit "Generate New Maze".
 *
 * Components (weights sum to 1.0 before penalty):
 *   path length  × 0.35  (normalised to refPath; capped at 1.5×)
 *   turn count   × 0.25  (normalised to refTurns; capped at 1.5×)
 *   zone coverage× 0.20  (zones visited / 16)
 *   min span     × 0.15  (min of normalised x-span and y-span; catches band paths)
 *   border penalty        (soft; only subtracts when borderFraction > 35%)
 *
 * Typical range: 0.0 – ~1.2. Conservative early-exit threshold: 0.45.
 */
export function computeFullScore(
  metrics: SolutionMetrics,
  totalCells: number,
): number {
  const { refPath, refTurns } = refValues(totalCells);

  const pathScore    = Math.min(metrics.pathLength / refPath,  1.5);
  const turnScore    = Math.min(metrics.turnCount  / refTurns, 1.5);
  const zoneScore    = metrics.zoneCount / 16;
  const borderExcess = metrics.borderFraction > 0.35
    ? (metrics.borderFraction - 0.35) * 0.5
    : 0;

  return Math.max(0,
    pathScore      * 0.35 +
    turnScore      * 0.25 +
    zoneScore      * 0.20 +
    metrics.minSpan * 0.15 -
    borderExcess   * 0.10,
  );
}

/**
 * Light composite score for live custom-size slider preview.
 * Includes minSpan — it is computed in the same O(n) pass and costs nothing extra.
 * More permissive threshold (0.35) and lower span weight than full mode.
 */
export function computeLightScore(
  metrics: SolutionMetrics,
  totalCells: number,
): number {
  const { refPath, refTurns } = refValues(totalCells);
  return Math.min(metrics.pathLength / refPath,  1.5) * 0.55
       + Math.min(metrics.turnCount  / refTurns, 1.5) * 0.30
       + metrics.minSpan                               * 0.15;
}

/**
 * Same-side depth gate: returns true if the solution path reaches the
 * perpendicular center strip [35%, 65%] of the maze.
 *
 * A same-side path that never crosses this strip is definitionally shallow
 * and should be hard-rejected (not scored).
 */
export function sameSideDepthGate(
  sol: number[],
  width: number,
  height: number,
  entrySide: Side,
): boolean {
  const isHorizontal = entrySide === 0 || entrySide === 2; // top or bottom
  const lo = isHorizontal ? Math.floor(height * 0.35) : Math.floor(width  * 0.35);
  const hi = isHorizontal ? Math.ceil(height  * 0.65) : Math.ceil(width   * 0.65);
  for (const idx of sol) {
    const val = isHorizontal ? ((idx / width) | 0) : (idx % width);
    if (val >= lo && val <= hi) return true;
  }
  return false;
}
