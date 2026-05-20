/**
 * Maze Difficulty Scaling Audit
 *
 * Generates 500 mazes per preset (Small → Monster + rectangular variants),
 * computes extended difficulty metrics including decision points and wrong-branch
 * depths, and writes:
 *
 *   scripts/output/maze-difficulty-audit/raw-maze-difficulty-data.csv
 *   scripts/output/maze-difficulty-audit/maze-difficulty-summary.csv
 *
 * Run: npm run difficulty:audit
 */
import { generateMaze } from '../src/lib/maze/generator.js';
import { scoreMetrics, computeFullScore } from '../src/lib/maze/quality.js';
import { getPassages, pointToIndex, indexToPoint } from '../src/lib/maze/utils.js';
import type { Difficulty, MazeGrid } from '../src/types/maze.js';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';

// ── Preset definitions ─────────────────────────────────────────────────────────

type PresetSpec = {
  name: string;
  width: number;
  height: number;
  difficulty: Difficulty;
};

const PRESETS: PresetSpec[] = [
  { name: 'Small',    width: 20,  height: 20,  difficulty: 'small'  },
  { name: 'Medium',   width: 40,  height: 40,  difficulty: 'medium' },
  { name: 'Large',    width: 60,  height: 60,  difficulty: 'large'  },
  { name: 'Expert',   width: 80,  height: 80,  difficulty: 'large'  },
  { name: 'Monster',  width: 100, height: 100, difficulty: 'large'  },
  { name: 'Wide',     width: 100, height: 10,  difficulty: 'large'  },
  { name: 'Tall',     width: 10,  height: 100, difficulty: 'large'  },
  { name: 'WideRect', width: 60,  height: 30,  difficulty: 'large'  },
  { name: 'TallRect', width: 30,  height: 60,  difficulty: 'large'  },
];

const SAMPLES_PER_PRESET = 500;
const SEED_BASE = 60000; // offset from existing audit scripts

const ACCEPTANCE_THRESHOLD = 0.78;

// ── Metric computation ─────────────────────────────────────────────────────────

function computeDecisionPoints(
  solution: number[],
  grid: MazeGrid,
  width: number,
  height: number,
): number {
  let count = 0;
  for (let i = 0; i < solution.length - 1; i++) {
    const prevIdx = i > 0 ? solution[i - 1] : -1;
    const nextIdx = solution[i + 1];
    const passages = getPassages(grid, indexToPoint(solution[i], width), width, height);
    if (passages.some(p => {
      const pIdx = pointToIndex(p, width);
      return pIdx !== prevIdx && pIdx !== nextIdx;
    })) {
      count++;
    }
  }
  return count;
}

function measureBranch(
  start: number,
  solutionSet: Set<number>,
  globalVisited: Set<number>,
  grid: MazeGrid,
  width: number,
  height: number,
): { maxDepth: number; deadEnds: number } {
  const dist = new Map<number, number>([[start, 0]]);
  const childCount = new Map<number, number>([[start, 0]]);
  const queue: number[] = [start];
  globalVisited.add(start);
  let maxDepth = 0;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = dist.get(curr)!;
    for (const p of getPassages(grid, indexToPoint(curr, width), width, height)) {
      const nIdx = pointToIndex(p, width);
      if (!solutionSet.has(nIdx) && !dist.has(nIdx)) {
        dist.set(nIdx, currDepth + 1);
        globalVisited.add(nIdx);
        if (currDepth + 1 > maxDepth) maxDepth = currDepth + 1;
        queue.push(nIdx);
        childCount.set(curr, (childCount.get(curr) ?? 0) + 1);
        childCount.set(nIdx, 0);
      }
    }
  }

  let deadEnds = 0;
  for (const children of childCount.values()) {
    if (children === 0) deadEnds++;
  }
  return { maxDepth, deadEnds };
}

type WrongBranchResult = {
  deadEndsReachableFromSolution: number;
  averageWrongBranchLength: number;
  maxWrongBranchLength: number;
};

function computeWrongBranchMetrics(
  solution: number[],
  grid: MazeGrid,
  width: number,
  height: number,
): WrongBranchResult {
  const solutionSet = new Set(solution);
  const globalVisited = new Set<number>();
  const branchLengths: number[] = [];
  let deadEndCount = 0;

  for (let i = 0; i < solution.length - 1; i++) {
    const prevIdx = i > 0 ? solution[i - 1] : -1;
    const nextIdx = solution[i + 1];
    for (const p of getPassages(grid, indexToPoint(solution[i], width), width, height)) {
      const nIdx = pointToIndex(p, width);
      if (nIdx !== prevIdx && nIdx !== nextIdx && !solutionSet.has(nIdx) && !globalVisited.has(nIdx)) {
        const { maxDepth, deadEnds } = measureBranch(nIdx, solutionSet, globalVisited, grid, width, height);
        branchLengths.push(maxDepth);
        deadEndCount += deadEnds;
      }
    }
  }

  const avg = branchLengths.length > 0
    ? branchLengths.reduce((s, v) => s + v, 0) / branchLengths.length
    : 0;
  const max = branchLengths.length > 0 ? Math.max(...branchLengths) : 0;

  return {
    deadEndsReachableFromSolution: deadEndCount,
    averageWrongBranchLength: avg,
    maxWrongBranchLength: max,
  };
}

/**
 * Composite difficulty score — all four components range [0, 1], weights sum to 1.
 *
 * difficultyScore =
 *   0.30 × solutionPathFraction                              (how much of the maze you traverse)
 * + 0.20 × min(1, turnsPer100PathCells / 50)                (how twisty, capped at 50 turns/100)
 * + 0.25 × min(1, decisionPointsPer100PathCells / 25)       (how many choices, capped at 25/100)
 * + 0.25 × min(1, averageWrongBranchLength / √totalCells)   (trap depth relative to maze size)
 */
function computeDifficultyScore(
  solutionPathFraction: number,
  turnsPer100: number,
  decisionPer100: number,
  avgWrongBranch: number,
  totalCells: number,
): number {
  return (
    0.30 * solutionPathFraction +
    0.20 * Math.min(1, turnsPer100 / 50) +
    0.25 * Math.min(1, decisionPer100 / 25) +
    0.25 * Math.min(1, avgWrongBranch / Math.sqrt(totalCells))
  );
}

// ── Statistics ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100)));
  return sorted[idx];
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], m?: number): number {
  if (values.length === 0) return 0;
  const mu = m ?? mean(values);
  const variance = values.reduce((s, v) => s + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

function csvRow(fields: (string | number | boolean)[]): string {
  return fields.map(f => {
    const s = String(f);
    return s.includes(',') ? `"${s}"` : s;
  }).join(',') + '\n';
}

// ── Main ───────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = 'scripts/output/maze-difficulty-audit';

const RAW_HEADER = [
  'preset', 'width', 'height', 'seed', 'totalCells',
  'solutionPathCells', 'solutionPathFraction',
  'solutionTurns', 'turnsPer100PathCells',
  'solutionDecisionPoints', 'decisionPointsPer100PathCells',
  'deadEndsReachableFromSolution',
  'averageWrongBranchLength', 'maxWrongBranchLength',
  'zoneCoverage', 'minSpan',
  'fallbackUsed',
  'generationTimeMs', 'compositeScore', 'difficultyScore',
].join(',') + '\n';

const SUMMARY_METRICS = [
  'solutionPathCells', 'solutionPathFraction',
  'solutionTurns', 'turnsPer100PathCells',
  'solutionDecisionPoints', 'decisionPointsPer100PathCells',
  'averageWrongBranchLength', 'maxWrongBranchLength',
  'zoneCoverage', 'minSpan',
  'generationTimeMs', 'compositeScore', 'difficultyScore',
] as const;

type MetricKey = typeof SUMMARY_METRICS[number];
type RawRecord = Record<MetricKey, number> & {
  preset: string; width: number; height: number; seed: number;
  totalCells: number; deadEndsReachableFromSolution: number;
  fallbackUsed: boolean;
};

await mkdir(OUTPUT_DIR, { recursive: true });

const rawStream = createWriteStream(`${OUTPUT_DIR}/raw-maze-difficulty-data.csv`);
rawStream.write(RAW_HEADER);

const allRecords: RawRecord[] = [];

console.log(`\n=== Maze Difficulty Audit — ${new Date().toISOString().slice(0, 10)} ===`);
console.log(`Presets: ${PRESETS.map(p => p.name).join(', ')}`);
console.log(`Samples per preset: ${SAMPLES_PER_PRESET}\n`);

for (const preset of PRESETS) {
  const { name, width, height, difficulty } = preset;
  const totalCells = width * height;

  process.stdout.write(`Generating ${SAMPLES_PER_PRESET} × ${name} (${width}×${height})...`);

  for (let i = 0; i < SAMPLES_PER_PRESET; i++) {
    const seed = SEED_BASE + i;

    const t0 = performance.now();
    const maze = generateMaze({ width, height, difficulty, seed, anyPortalSide: true });
    const genMs = performance.now() - t0;

    const sol = maze.solution;
    const pathCells = sol.length;
    const pathFraction = pathCells / totalCells;

    const metrics = scoreMetrics(sol, width, height);
    const compositeScore = computeFullScore(metrics, totalCells);

    const turnCount = metrics.turnCount;
    const turnsPer100 = pathCells > 0 ? (turnCount / pathCells) * 100 : 0;

    const decisionPoints = computeDecisionPoints(sol, maze.grid, width, height);
    const decisionPer100 = pathCells > 0 ? (decisionPoints / pathCells) * 100 : 0;

    const wrongBranch = computeWrongBranchMetrics(sol, maze.grid, width, height);

    const zoneCoverage = metrics.zoneCount / 16;
    const minSpan = metrics.minSpan;

    const fallbackUsed = compositeScore < ACCEPTANCE_THRESHOLD;

    const difficultyScore = computeDifficultyScore(
      pathFraction, turnsPer100, decisionPer100,
      wrongBranch.averageWrongBranchLength, totalCells,
    );

    const record: RawRecord = {
      preset: name, width, height, seed, totalCells,
      solutionPathCells: pathCells,
      solutionPathFraction: pathFraction,
      solutionTurns: turnCount,
      turnsPer100PathCells: turnsPer100,
      solutionDecisionPoints: decisionPoints,
      decisionPointsPer100PathCells: decisionPer100,
      deadEndsReachableFromSolution: wrongBranch.deadEndsReachableFromSolution,
      averageWrongBranchLength: wrongBranch.averageWrongBranchLength,
      maxWrongBranchLength: wrongBranch.maxWrongBranchLength,
      zoneCoverage,
      minSpan,
      fallbackUsed,
      generationTimeMs: genMs,
      compositeScore,
      difficultyScore,
    };
    allRecords.push(record);

    rawStream.write(csvRow([
      name, width, height, seed, totalCells,
      pathCells, pathFraction.toFixed(6),
      turnCount, turnsPer100.toFixed(4),
      decisionPoints, decisionPer100.toFixed(4),
      wrongBranch.deadEndsReachableFromSolution,
      wrongBranch.averageWrongBranchLength.toFixed(4),
      wrongBranch.maxWrongBranchLength,
      zoneCoverage.toFixed(4),
      minSpan.toFixed(6),
      fallbackUsed,
      genMs.toFixed(3),
      compositeScore.toFixed(6),
      difficultyScore.toFixed(6),
    ]));
  }

  const presetRecords = allRecords.filter(r => r.preset === name);
  const fallbackCount = presetRecords.filter(r => r.fallbackUsed).length;
  const p50path = percentile([...presetRecords.map(r => r.solutionPathCells)].sort((a,b) => a-b), 50);
  const p50score = percentile([...presetRecords.map(r => r.difficultyScore)].sort((a,b) => a-b), 50);
  console.log(` done.  p50PathCells=${p50path}  p50Difficulty=${p50score.toFixed(3)}  fallback=${fallbackCount}/${SAMPLES_PER_PRESET}`);
}

rawStream.end();
await new Promise(resolve => rawStream.on('finish', resolve));
console.log(`\nRaw data written to ${OUTPUT_DIR}/raw-maze-difficulty-data.csv`);

// ── Aggregate summary ──────────────────────────────────────────────────────────

const SUMMARY_HEADER = [
  'preset', 'metric',
  'p10', 'p25', 'p50', 'p75', 'p90',
  'mean', 'std', 'min', 'max',
].join(',') + '\n';

const summaryStream = createWriteStream(`${OUTPUT_DIR}/maze-difficulty-summary.csv`);
summaryStream.write(SUMMARY_HEADER);

for (const preset of PRESETS) {
  const rows = allRecords.filter(r => r.preset === preset.name);
  for (const metric of SUMMARY_METRICS) {
    const values = rows.map(r => r[metric] as number);
    const sorted = [...values].sort((a, b) => a - b);
    const mu = mean(values);
    summaryStream.write(csvRow([
      preset.name, metric,
      percentile(sorted, 10).toFixed(6),
      percentile(sorted, 25).toFixed(6),
      percentile(sorted, 50).toFixed(6),
      percentile(sorted, 75).toFixed(6),
      percentile(sorted, 90).toFixed(6),
      mu.toFixed(6),
      stddev(values, mu).toFixed(6),
      sorted[0].toFixed(6),
      sorted[sorted.length - 1].toFixed(6),
    ]));
  }
}

summaryStream.end();
await new Promise(resolve => summaryStream.on('finish', resolve));
console.log(`Summary written to ${OUTPUT_DIR}/maze-difficulty-summary.csv`);
console.log('\nDone. Run `python3 scripts/maze-difficulty-visualize.py` to generate charts and report.\n');
