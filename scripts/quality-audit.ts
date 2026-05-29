/**
 * Quality Audit Script
 *
 * Generates sample mazes per size and reports metrics:
 *   - solution path length / coverage
 *   - path spread (x-span / y-span / minSpan)
 *   - zone concentration (Herfindahl index)
 *   - endpoint side relationship
 *   - quality pass rate (score ≥ 0.78, the actual acceptance threshold)
 *   - generation timing (avg, p50, p95)
 *   - fallback rate proxy (score < 0.78)
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
  /** True for non-square mazes so reporting notes aspect ratio. */
  rectangular?: boolean;
};

// Square presets (canonical tiers + expert + hardcore)
const SQUARE_SIZES: SizeSpec[] = [
  { label: '20×20',   w: 20,  h: 20,  difficulty: 'small',  count: 200, seedBase: 50000 },
  { label: '40×40',   w: 40,  h: 40,  difficulty: 'medium', count: 150, seedBase: 51000 },
  { label: '60×60',   w: 60,  h: 60,  difficulty: 'large',  count: 100, seedBase: 52000 },
  { label: '80×80',   w: 80,  h: 80,  difficulty: 'large',  count:  75, seedBase: 53000 },
  { label: '100×100', w: 100, h: 100, difficulty: 'large',  count:  50, seedBase: 54000 },
];

// Rectangular presets — aspect ratios from gentle (2:1) to extreme (10:1)
const RECT_SIZES: SizeSpec[] = [
  { label: '60×30',  w: 60,  h: 30,  difficulty: 'medium', count: 75, seedBase: 55000, rectangular: true },
  { label: '30×60',  w: 30,  h: 60,  difficulty: 'medium', count: 75, seedBase: 56000, rectangular: true },
  { label: '80×20',  w: 80,  h: 20,  difficulty: 'medium', count: 75, seedBase: 57000, rectangular: true },
  { label: '20×80',  w: 20,  h: 80,  difficulty: 'medium', count: 75, seedBase: 58000, rectangular: true },
  { label: '100×10', w: 100, h: 10,  difficulty: 'medium', count: 75, seedBase: 59000, rectangular: true },
  { label: '10×100', w: 10,  h: 100, difficulty: 'medium', count: 75, seedBase: 60000, rectangular: true },
];

const SIZES: SizeSpec[] = [...SQUARE_SIZES, ...RECT_SIZES];

/** Threshold used by the generator's quality gate in full mode. */
const ACCEPTANCE_THRESHOLD = 0.78;

type AuditRecord = {
  pathFraction: number;
  turnCount: number;
  zoneCount: number;
  borderFraction: number;
  compositeScore: number;
  xSpan: number;
  ySpan: number;
  minSpan: number;
  /**
   * Herfindahl zone concentration: sum of (cellsInZone/pathLen)².
   * Normalised to [0, 1]: 0 = perfectly even across all zones, 1 = all in one zone.
   */
  zoneHHI: number;
  sameSide: boolean;
  /** True if composite score < ACCEPTANCE_THRESHOLD — proxy for quality gate failure. */
  subthreshold: boolean;
  /** Wall-clock milliseconds for generateMaze(). */
  genMs: number;
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

  let hhi = 0;
  for (let z = 0; z < ZONE_ROWS * ZONE_COLS; z++) {
    const frac = zoneCounts[z] / sol.length;
    hhi += frac * frac;
  }
  const totalZones = ZONE_ROWS * ZONE_COLS;
  const hhiMin = 1 / totalZones;
  const zoneHHI = Math.max(0, (hhi - hhiMin) / (1 - hhiMin));

  return { xSpan, ySpan, minSpan: Math.min(xSpan, ySpan), zoneHHI };
}

function determineSameSide(maze: ReturnType<typeof generateMaze>): boolean {
  const { entry, exit, width, height } = maze;
  const side = (p: typeof entry): number =>
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
  const sorted = [...values].sort((a, b) => a - b);
  const [p10, p25, p50, p75, p90, p95] = [10, 25, 50, 75, 90, 95].map(q => percentile(sorted, q));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return `  ${label.padEnd(14)}${p(p10)} ${p(p25)} ${p(p50)} ${p(p75)} ${p(p90)} ${p(p95)} ${p(mean)}`;
}

function sortedNumbers(records: AuditRecord[], key: keyof AuditRecord): number[] {
  return (records.map(r => r[key] as number)).sort((a, b) => a - b);
}

console.log(`\n=== Maze Quality Audit — ${new Date().toISOString().slice(0, 10)} ===`);
console.log(`Acceptance threshold: ${ACCEPTANCE_THRESHOLD}\n`);

for (const spec of SIZES) {
  const records: AuditRecord[] = [];
  const totalCells = spec.w * spec.h;
  const aspectLabel = spec.rectangular
    ? `  [aspect ${Math.max(spec.w,spec.h)/Math.min(spec.w,spec.h)}:1]`
    : '';

  process.stdout.write(`Generating ${spec.count} × ${spec.label}${aspectLabel} mazes...`);

  for (let i = 0; i < spec.count; i++) {
    const seed = spec.seedBase + i;
    const t0 = performance.now();
    const maze = generateMaze({
      width:     spec.w,
      height:    spec.h,
      difficulty: spec.difficulty,
      seed,
      anyPortalSide: true,
    });
    const genMs = performance.now() - t0;

    const sol = maze.solution;
    const metrics = scoreMetrics(sol, spec.w, spec.h);
    const compositeScore = computeFullScore(metrics, totalCells);
    const { xSpan, ySpan, minSpan, zoneHHI } = computeSpreadAndConcentration(sol, spec.w, spec.h);

    records.push({
      pathFraction:   sol.length / totalCells,
      turnCount:      metrics.turnCount,
      zoneCount:      metrics.zoneCount,
      borderFraction: metrics.borderFraction,
      compositeScore,
      xSpan,
      ySpan,
      minSpan,
      zoneHHI,
      sameSide:       determineSameSide(maze),
      subthreshold:   compositeScore < ACCEPTANCE_THRESHOLD,
      genMs,
    });
  }

  console.log(` done.\n`);

  const refs = refValues(totalCells);
  const sameSideCount  = records.filter(r => r.sameSide).length;
  const subthreshCount = records.filter(r => r.subthreshold).length;
  const passCount      = spec.count - subthreshCount;
  const gensMs         = records.map(r => r.genMs).sort((a, b) => a - b);
  const p95Ms          = percentile(gensMs, 95);
  const p50Ms          = percentile(gensMs, 50);
  const avgMs          = gensMs.reduce((s, v) => s + v, 0) / gensMs.length;

  console.log(`Size: ${spec.label}${aspectLabel} (${spec.count} mazes)`);
  console.log(`  refPath=${refs.refPath}  refTurns=${refs.refTurns}`);
  console.log(`  sameSide: ${sameSideCount}/${spec.count} (${(sameSideCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  quality pass (score≥${ACCEPTANCE_THRESHOLD}): ${passCount}/${spec.count} (${(passCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  subthreshold (score<${ACCEPTANCE_THRESHOLD}): ${subthreshCount}/${spec.count} (${(subthreshCount/spec.count*100).toFixed(1)}%) ← fallback proxy`);
  console.log(`  timing: avg=${avgMs.toFixed(1)}ms  p50=${p50Ms.toFixed(1)}ms  p95=${p95Ms.toFixed(1)}ms`);
  console.log('');
  console.log(`  metric          p10     p25     p50     p75     p90     p95     mean`);
  console.log(`  ────────────────────────────────────────────────────────────────────`);
  console.log(row('pathFraction',  records.map(r => r.pathFraction),  true));
  console.log(row('turnCount',     records.map(r => r.turnCount)));
  console.log(row('zoneCount',     records.map(r => r.zoneCount)));
  console.log(row('borderFrac',    records.map(r => r.borderFraction), true));
  console.log(row('composite',     records.map(r => r.compositeScore)));
  console.log('');
  console.log(`  ── Spread (0–1) ──`);
  console.log(row('xSpan',         records.map(r => r.xSpan)));
  console.log(row('ySpan',         records.map(r => r.ySpan)));
  console.log(row('minSpan',       records.map(r => r.minSpan)));
  console.log(`  zoneHHI (0=uniform, 1=concentrated):`);
  console.log(row('zoneHHI',       records.map(r => r.zoneHHI)));

  const narrowCount     = records.filter(r => r.minSpan < 0.50).length;
  const veryNarrowCount = records.filter(r => r.minSpan < 0.33).length;
  const highConcCount   = records.filter(r => r.zoneHHI > 0.30).length;
  console.log('');
  console.log(`  minSpan < 0.50: ${narrowCount}/${spec.count} (${(narrowCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  minSpan < 0.33: ${veryNarrowCount}/${spec.count} (${(veryNarrowCount/spec.count*100).toFixed(1)}%)`);
  console.log(`  zoneHHI > 0.30: ${highConcCount}/${spec.count} (${(highConcCount/spec.count*100).toFixed(1)}%)`);

  const oppositeRecords = records.filter(r => !r.sameSide);
  const sameSideRecords = records.filter(r => r.sameSide);
  if (sameSideRecords.length > 0 && oppositeRecords.length > 0) {
    const oppMean  = oppositeRecords.reduce((s,r) => s+r.minSpan, 0) / oppositeRecords.length;
    const sameMean = sameSideRecords.reduce((s,r)  => s+r.minSpan, 0) / sameSideRecords.length;
    console.log(`  minSpan mean: opposite=${oppMean.toFixed(3)}  same-side=${sameMean.toFixed(3)}`);
  }

  if (spec.rectangular) {
    // For rectangular mazes, note expected asymmetry between xSpan and ySpan.
    const longAxis = spec.w >= spec.h ? 'xSpan' : 'ySpan';
    const shortAxis = spec.w >= spec.h ? 'ySpan' : 'xSpan';
    const longMed  = percentile(sortedNumbers(records, spec.w >= spec.h ? 'xSpan' : 'ySpan'), 50);
    const shortMed = percentile(sortedNumbers(records, spec.w >= spec.h ? 'ySpan' : 'xSpan'), 50);
    console.log(`  [rect] long-axis (${longAxis}) p50=${longMed.toFixed(3)}  short-axis (${shortAxis}) p50=${shortMed.toFixed(3)}`);
  }

  // Calibration warnings
  if (subthreshCount / spec.count > 0.15) {
    console.log(`\n  ⚠ Fallback rate is ${(subthreshCount/spec.count*100).toFixed(1)}% > 15% — composite threshold or endpoint selection may need adjustment.`);
  }
  const medianTurns = percentile(sortedNumbers(records, 'turnCount'), 50);
  if (Math.abs(medianTurns - refs.refTurns) / refs.refTurns > 0.25) {
    console.log(`\n  ⚠ refTurns=${refs.refTurns} vs observed p50=${medianTurns.toFixed(0)} (>${25}% gap) — check refValues().`);
  }
  console.log('');
}

console.log('=== Audit complete ===\n');
