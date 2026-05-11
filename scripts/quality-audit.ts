/**
 * Quality Audit Script — Phase 2 (extended)
 *
 * Generates sample mazes per size and reports metrics to calibrate:
 *   - refTurnCount values in quality.ts
 *   - composite score thresholds
 *   - fallback usage rates
 *   - path spread (x-span / y-span)
 *   - zone concentration (Herfindahl index)
 *
 * Run: npm run quality:audit
 */
import { generateMaze } from '../src/lib/maze/generator.js';
import { scoreMetrics, computeFullScore, refValues } from '../src/lib/maze/quality.js';
import type { Difficulty } from '../src/types/maze.js';

type SizeSpec = {
  label: string;
  w: number;
  h: number;
  difficulty: Difficulty;
  count: number;
  seedBase: number;
};

const SIZES: SizeSpec[] = [
  { label: '20×20',   w: 20,  h: 20,  difficulty: 'small',  count: 200, seedBase: 50000 },
  { label: '40×40',   w: 40,  h: 40,  difficulty: 'medium', count: 150, seedBase: 51000 },
  { label: '60×60',   w: 60,  h: 60,  difficulty: 'large',  count: 100, seedBase: 52000 },
  { label: '80×80',   w: 80,  h: 80,  difficulty: 'large',  count: 75,  seedBase: 53000 },
  { label: '100×100', w: 100, h: 100, difficulty: 'large',  count: 50,  seedBase: 54000 },
];

type AuditRecord = {
  pathFraction: number;
  turnCount: number;
  zoneCount: number;
  borderFraction: number;
  compositeScore: number;
  /** (maxX − minX) / (width − 1) — normalized to [0, 1] */
  xSpan: number;
  /** (maxY − minY) / (height − 1) — normalized to [0, 1] */
  ySpan: number;
  /** min(xSpan, ySpan) — the bottleneck; a path wide but tall=0 means a horizontal band */
  minSpan: number;
  /**
   * Herfindahl zone concentration: sum of (cellsInZone/pathLen)² across all zones.
   * 0 = perfectly even, 1/numZones = all path in one zone.
   * Normalized to [0, 1] for display: HHI / (1/16) where 16 = total zones.
   * Higher = more concentrated in fewer zones.
   */
  zoneHHI: number;
  sameSide: boolean;
  /** True if composite score < full-mode threshold (proxy for fallback/subthreshold candidate). */
  subthreshold: boolean;
};

function computeSpreadAndConcentration(
  sol: number[],
  width: number,
  height: number,
): { xSpan: number; ySpan: number; minSpan: number; zoneHHI: number } {
  if (sol.length === 0) return { xSpan: 0, ySpan: 0, minSpan: 0, zoneHHI: 1 };

  let minX = width,  maxX = -1;
  let minY = height, maxY = -1;

  const ZONE_ROWS = 4;
  const ZONE_COLS = 4;
  const cellsPerZoneX = width  / ZONE_COLS;
  const cellsPerZoneY = height / ZONE_ROWS;
  const zoneCounts = new Float32Array(ZONE_ROWS * ZONE_COLS);

  for (const idx of sol) {
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const zx = Math.min((x / cellsPerZoneX) | 0, ZONE_COLS - 1);
    const zy = Math.min((y / cellsPerZoneY) | 0, ZONE_ROWS - 1);
    zoneCounts[zy * ZONE_COLS + zx]++;
  }

  const xSpan = (maxX - minX) / Math.max(1, width  - 1);
  const ySpan = (maxY - minY) / Math.max(1, height - 1);
  const minSpan = Math.min(xSpan, ySpan);

  // Raw HHI: sum of squared zone fractions
  let hhi = 0;
  for (let z = 0; z < ZONE_ROWS * ZONE_COLS; z++) {
    const frac = zoneCounts[z] / sol.length;
    hhi += frac * frac;
  }
  // Normalize: divide by 1/numZones (the "all in one zone" value) so 1.0 = maximally concentrated.
  // A uniform spread across all zones gives HHI = 1/16 = 0.0625; normalised = 0.0625 / (1/16) = 1.0 ... no.
  // Actually uniform gives HHI_raw = 16 × (1/16)² = 1/16. All in one zone gives HHI_raw = 1.
  // Normalise: (HHI_raw - 1/16) / (1 - 1/16) maps [uniform → concentrated] to [0 → 1].
  const totalZones = ZONE_ROWS * ZONE_COLS;
  const hhiMin = 1 / totalZones; // minimum possible (uniform spread)
  const zoneHHI = Math.max(0, (hhi - hhiMin) / (1 - hhiMin));

  return { xSpan, ySpan, minSpan, zoneHHI };
}

function determineSides(maze: ReturnType<typeof generateMaze>): boolean {
  const { entry, exit, width, height } = maze;
  const side = (p: typeof entry) =>
    p.y === 0 ? 0 : p.x === width - 1 ? 1 : p.y === height - 1 ? 2 : 3;
  return side(entry) === side(exit);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100)));
  return sorted[idx];
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals).padStart(7);
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(1).padStart(6) + '%';
}
function row(label: string, values: number[], asPct = false): string {
  const p = (n: number) => asPct ? fmtPct(n) : fmt(n, 3);
  const [p10, p25, p50, p75, p90] = [10, 25, 50, 75, 90].map(q => percentile(values, q));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return `  ${label.padEnd(14)}${p(p10)} ${p(p25)} ${p(p50)} ${p(p75)} ${p(p90)} ${p(mean)}`;
}

function sortedArr(records: AuditRecord[], key: keyof AuditRecord): number[] {
  return (records.map(r => r[key] as number)).sort((a, b) => a - b);
}

const FULL_THRESHOLD = 0.45;

console.log(`\n=== Maze Quality Audit (extended) — ${new Date().toISOString().slice(0, 10)} ===\n`);

for (const spec of SIZES) {
  const records: AuditRecord[] = [];
  const totalCells = spec.w * spec.h;

  process.stdout.write(`Generating ${spec.count} × ${spec.label} mazes...`);

  for (let i = 0; i < spec.count; i++) {
    const seed = spec.seedBase + i;
    const maze = generateMaze({
      width: spec.w,
      height: spec.h,
      difficulty: spec.difficulty,
      seed,
      anyPortalSide: true,
    });

    const sol = maze.solution;
    const metrics = scoreMetrics(sol, spec.w, spec.h);
    const compositeScore = computeFullScore(metrics, totalCells);
    const { xSpan, ySpan, minSpan, zoneHHI } = computeSpreadAndConcentration(sol, spec.w, spec.h);
    const sameSide = determineSides(maze);

    records.push({
      pathFraction: sol.length / totalCells,
      turnCount: metrics.turnCount,
      zoneCount: metrics.zoneCount,
      borderFraction: metrics.borderFraction,
      compositeScore,
      xSpan,
      ySpan,
      minSpan,
      zoneHHI,
      sameSide,
      subthreshold: compositeScore < FULL_THRESHOLD,
    });
  }

  console.log(` done.\n`);

  const refs = refValues(totalCells);
  const sameSideCount  = records.filter(r => r.sameSide).length;
  const subthreshCount = records.filter(r => r.subthreshold).length;

  // Split into same-side and non-same-side for spread analysis
  const oppositeRecords = records.filter(r => !r.sameSide);
  const sameSideRecords = records.filter(r => r.sameSide);

  console.log(`Size: ${spec.label} (${spec.count} mazes)`);
  console.log(`  refPath=${refs.refPath}  refTurns=${refs.refTurns}`);
  console.log(`  sameSide: ${sameSideCount}/${spec.count} (${(sameSideCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  subthreshold (score<${FULL_THRESHOLD}): ${subthreshCount}/${spec.count} (${(subthreshCount/spec.count*100).toFixed(1)}%) ← fallback proxy`);
  console.log('');
  console.log(`  metric          p10     p25     p50     p75     p90     mean`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(row('pathFraction',  sortedArr(records,'pathFraction'),  true));
  console.log(row('turnCount',     sortedArr(records,'turnCount').map(Math.round)));
  console.log(row('zoneCount',     sortedArr(records,'zoneCount').map(Math.round)));
  console.log(row('borderFrac',    sortedArr(records,'borderFraction'), true));
  console.log(row('composite',     sortedArr(records,'compositeScore')));
  console.log('');
  console.log(`  ── Spread metrics (normalized 0–1) ──`);
  console.log(row('xSpan',         sortedArr(records,'xSpan')));
  console.log(row('ySpan',         sortedArr(records,'ySpan')));
  console.log(row('minSpan',       sortedArr(records,'minSpan')));
  console.log(`  zoneHHI (0=uniform spread, 1=all in one zone):`);
  console.log(row('zoneHHI',       sortedArr(records,'zoneHHI')));
  console.log('');

  // How often does the path fail to span ≥50% in the narrow axis?
  const narrowCount = records.filter(r => r.minSpan < 0.50).length;
  const veryNarrowCount = records.filter(r => r.minSpan < 0.33).length;
  const highConcCount = records.filter(r => r.zoneHHI > 0.30).length;
  console.log(`  minSpan < 0.50 (path band in one half): ${narrowCount}/${spec.count} (${(narrowCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  minSpan < 0.33 (path band in one third): ${veryNarrowCount}/${spec.count} (${(veryNarrowCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  zoneHHI > 0.30 (concentrated in few zones): ${highConcCount}/${spec.count} (${(highConcCount/spec.count*100).toFixed(1)}%)`);

  // Same-side vs opposite-side spread comparison
  if (sameSideRecords.length > 0) {
    const oppMinSpan  = oppositeRecords.map(r => r.minSpan);
    const sameMinSpan = sameSideRecords.map(r => r.minSpan);
    const oppMean  = oppMinSpan.reduce((s,v) => s+v,0) / oppMinSpan.length;
    const sameMean = sameMinSpan.reduce((s,v) => s+v,0) / sameMinSpan.length;
    console.log(`  minSpan mean: opposite-side=${oppMean.toFixed(3)}  same-side=${sameMean.toFixed(3)}`);
  }

  // Calibration warnings
  if (subthreshCount / spec.count > 0.15) {
    console.log(`\n  ⚠ Fallback rate is ${(subthreshCount/spec.count*100).toFixed(1)}% — consider lowering composite threshold.`);
  }
  const medianTurns = percentile(sortedArr(records,'turnCount'), 50);
  if (Math.abs(medianTurns - refs.refTurns) / refs.refTurns > 0.25) {
    console.log(`\n  ⚠ refTurns=${refs.refTurns} vs observed median=${medianTurns.toFixed(0)} (>${25}% gap) — update refValues().`);
  }
  console.log('');
}

console.log('Audit complete.\n');
console.log('Key questions for spread analysis:');
console.log('  1. Is minSpan < 0.50 frequent for Expert/Monster? (band problem)');
console.log('  2. Is zoneHHI high even when zoneCount is decent? (concentrated in a few zones)');
console.log('  3. Does same-side have lower minSpan than opposite-side? (expected)');
console.log('  4. Would a minSpan score component help differentiation at 80×80 and 100×100?');
