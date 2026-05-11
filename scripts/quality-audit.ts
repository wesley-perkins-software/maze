/**
 * Quality Audit Script — Phase 2
 *
 * Generates sample mazes per size and reports metrics to calibrate:
 *   - refTurnCount values in quality.ts
 *   - composite score thresholds
 *   - fallback usage rates
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

type Record = {
  pathLength: number;
  pathFraction: number;
  turnCount: number;
  zoneCount: number;
  borderFraction: number;
  compositeScore: number;
  sameSide: boolean;
};

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

function determineSides(maze: ReturnType<typeof generateMaze>): { isSameSide: boolean } {
  const { entry, exit, width, height } = maze;
  const entrySide =
    entry.y === 0          ? 0 :
    entry.x === width  - 1 ? 1 :
    entry.y === height - 1 ? 2 : 3;
  const exitSide =
    exit.y === 0          ? 0 :
    exit.x === width  - 1 ? 1 :
    exit.y === height - 1 ? 2 : 3;
  return { isSameSide: entrySide === exitSide };
}

console.log(`\n=== Maze Quality Audit — ${new Date().toISOString().slice(0, 10)} ===\n`);

for (const spec of SIZES) {
  const records: Record[] = [];
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

    const metrics = scoreMetrics(maze.solution, spec.w, spec.h);
    const compositeScore = computeFullScore(metrics, totalCells);
    const { isSameSide } = determineSides(maze);

    records.push({
      pathLength: metrics.pathLength,
      pathFraction: metrics.pathLength / totalCells,
      turnCount: metrics.turnCount,
      zoneCount: metrics.zoneCount,
      borderFraction: metrics.borderFraction,
      compositeScore,
      sameSide: isSameSide,
    });
  }

  console.log(` done.\n`);

  const sortedPath  = [...records.map(r => r.pathFraction)].sort((a, b) => a - b);
  const sortedTurns = [...records.map(r => r.turnCount)].sort((a, b) => a - b);
  const sortedZones = [...records.map(r => r.zoneCount)].sort((a, b) => a - b);
  const sortedBorder = [...records.map(r => r.borderFraction)].sort((a, b) => a - b);
  const sortedScore = [...records.map(r => r.compositeScore)].sort((a, b) => a - b);

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const refs = refValues(totalCells);
  const sameSideCount = records.filter(r => r.sameSide).length;
  const passingThreshold045 = records.filter(r => r.compositeScore >= 0.45).length;
  const passingThreshold035 = records.filter(r => r.compositeScore >= 0.35).length;

  console.log(`Size: ${spec.label} (${spec.count} mazes)`);
  console.log(`  refPath=${refs.refPath} refTurns=${refs.refTurns}`);
  console.log(`  sameSide: ${sameSideCount}/${spec.count} (${(sameSideCount / spec.count * 100).toFixed(1)}%)`);
  console.log(`  composite ≥ 0.45: ${passingThreshold045}/${spec.count} (${(passingThreshold045 / spec.count * 100).toFixed(1)}%)`);
  console.log(`  composite ≥ 0.35: ${passingThreshold035}/${spec.count} (${(passingThreshold035 / spec.count * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`  metric          p10     p25     p50     p75     p90     mean`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  pathFraction  ${fmtPct(percentile(sortedPath,10))} ${fmtPct(percentile(sortedPath,25))} ${fmtPct(percentile(sortedPath,50))} ${fmtPct(percentile(sortedPath,75))} ${fmtPct(percentile(sortedPath,90))} ${fmtPct(mean(records.map(r=>r.pathFraction)))}`);
  console.log(`  turnCount     ${fmt(percentile(sortedTurns,10),0)} ${fmt(percentile(sortedTurns,25),0)} ${fmt(percentile(sortedTurns,50),0)} ${fmt(percentile(sortedTurns,75),0)} ${fmt(percentile(sortedTurns,90),0)} ${fmt(mean(records.map(r=>r.turnCount)),1)}`);
  console.log(`  zoneCount     ${fmt(percentile(sortedZones,10),0)} ${fmt(percentile(sortedZones,25),0)} ${fmt(percentile(sortedZones,50),0)} ${fmt(percentile(sortedZones,75),0)} ${fmt(percentile(sortedZones,90),0)} ${fmt(mean(records.map(r=>r.zoneCount)),1)}`);
  console.log(`  borderFrac    ${fmtPct(percentile(sortedBorder,10))} ${fmtPct(percentile(sortedBorder,25))} ${fmtPct(percentile(sortedBorder,50))} ${fmtPct(percentile(sortedBorder,75))} ${fmtPct(percentile(sortedBorder,90))} ${fmtPct(mean(records.map(r=>r.borderFraction)))}`);
  console.log(`  composite     ${fmt(percentile(sortedScore,10),3)} ${fmt(percentile(sortedScore,25),3)} ${fmt(percentile(sortedScore,50),3)} ${fmt(percentile(sortedScore,75),3)} ${fmt(percentile(sortedScore,90),3)} ${fmt(mean(records.map(r=>r.compositeScore)),3)}`);
  console.log('');

  // Calibration warnings
  if (passingThreshold045 / spec.count < 0.70) {
    console.log(`  ⚠ Warning: only ${(passingThreshold045/spec.count*100).toFixed(1)}% of mazes pass threshold 0.45.`);
    console.log(`    Consider lowering full-mode threshold if fallback rate is high in practice.`);
  }
  const medianTurns = percentile(sortedTurns, 50);
  if (Math.abs(medianTurns - refs.refTurns) / refs.refTurns > 0.25) {
    console.log(`  ⚠ refTurns=${refs.refTurns} differs from observed median=${medianTurns} by >25%.`);
    console.log(`    Consider updating refValues() in quality.ts.`);
  }
  console.log('');
}

console.log('Audit complete. Use the metrics above to calibrate:');
console.log('  - refValues() in src/lib/maze/quality.ts (refTurns)');
console.log('  - compositeThreshold in generateWithAnySidePortals() in generator.ts');
console.log('  - SAME_SIDE_MIN_ZONES if same-side rate is unexpectedly low\n');
