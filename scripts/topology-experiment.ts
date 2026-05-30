/**
 * Topology Experiment Script
 *
 * Compares 12 generation variants across 8 maze sizes (30 mazes each).
 * Tests newestBias, braidFactor, and carve start position combinations.
 *
 * Metrics per variant per size:
 *   - pathFraction p25/p50/p75/p95
 *   - turnCount p50
 *   - minSpan p50  (min of xSpan and ySpan — bottleneck axis coverage)
 *   - xSpan p50 / ySpan p50  (individual axes — spatial coverage)
 *   - fallback rate (composite score < 0.78)
 *   - gen time p50 (ms)
 *
 * Run: npm run topology:experiment
 */
import { generateMaze } from '../src/lib/maze/generator.js';
import { scoreMetrics, computeFullScore, refValues } from '../src/lib/maze/quality.js';
import { createPRNG } from '../src/lib/maze/prng.js';
import type { Difficulty, Point } from '../src/types/maze.js';

const ACCEPTANCE_THRESHOLD = 0.78;
const MAZES_PER_VARIANT   = 30;
const SEED_BASE           = 70000;

type Variant = {
  id:           string;
  newestBias:   number;
  braidFactor:  number;
  startMode:    'center' | 'corner' | 'random';
  description:  string;
};

const VARIANTS: Variant[] = [
  { id: 'A',  newestBias: 0.85, braidFactor: 0.01, startMode: 'center', description: 'Baseline (current production)' },
  { id: 'B1', newestBias: 0.90, braidFactor: 0.01, startMode: 'center', description: 'Moderate DFS increase' },
  { id: 'B2', newestBias: 0.95, braidFactor: 0.01, startMode: 'center', description: 'Near-pure DFS' },
  { id: 'B3', newestBias: 1.00, braidFactor: 0.01, startMode: 'center', description: 'Pure DFS + braid' },
  { id: 'C1', newestBias: 0.85, braidFactor: 0.00, startMode: 'center', description: 'Baseline, no braid' },
  { id: 'C2', newestBias: 0.90, braidFactor: 0.00, startMode: 'center', description: 'Higher DFS, no braid' },
  { id: 'C3', newestBias: 0.95, braidFactor: 0.00, startMode: 'center', description: 'Near-DFS, no braid' },
  { id: 'C4', newestBias: 1.00, braidFactor: 0.00, startMode: 'center', description: 'Pure DFS perfect maze' },
  { id: 'D1', newestBias: 0.85, braidFactor: 0.01, startMode: 'corner', description: 'Corner start (baseline bias)' },
  { id: 'D2', newestBias: 1.00, braidFactor: 0.00, startMode: 'corner', description: 'Best DFS hypothesis, corner' },
  { id: 'D3', newestBias: 0.85, braidFactor: 0.01, startMode: 'random', description: 'Random interior start' },
  { id: 'D4', newestBias: 1.00, braidFactor: 0.00, startMode: 'random', description: 'Pure DFS, random start' },
];

type SizeSpec = {
  label:      string;
  w:          number;
  h:          number;
  difficulty: Difficulty;
  rectangular?: boolean;
};

const SIZES: SizeSpec[] = [
  { label: '40×40',   w: 40,  h: 40,  difficulty: 'medium' },
  { label: '60×60',   w: 60,  h: 60,  difficulty: 'large'  },
  { label: '80×80',   w: 80,  h: 80,  difficulty: 'large'  },
  { label: '100×100', w: 100, h: 100, difficulty: 'large'  },
  { label: '60×30',   w: 60,  h: 30,  difficulty: 'medium', rectangular: true },
  { label: '30×60',   w: 30,  h: 60,  difficulty: 'medium', rectangular: true },
  { label: '100×10',  w: 100, h: 10,  difficulty: 'medium', rectangular: true },
  { label: '10×100',  w: 10,  h: 100, difficulty: 'medium', rectangular: true },
];

type VariantRecord = {
  pathFraction: number;
  turnCount:    number;
  minSpan:      number;
  xSpan:        number;
  ySpan:        number;
  score:        number;
  genMs:        number;
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100)));
  return sorted[idx];
}

function computeSpans(sol: number[], width: number, height: number): { xSpan: number; ySpan: number } {
  if (sol.length === 0) return { xSpan: 0, ySpan: 0 };
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const idx of sol) {
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    xSpan: (maxX - minX) / Math.max(1, width  - 1),
    ySpan: (maxY - minY) / Math.max(1, height - 1),
  };
}

function resolveStartCell(mode: Variant['startMode'], w: number, h: number, seed: number): Point | undefined {
  if (mode === 'center') return undefined; // use generator default
  if (mode === 'corner') return { x: 1, y: 1 };
  // random interior: pick using entropy-derived RNG
  const rng = createPRNG(seed ^ 0xdeadbeef);
  const totalCells = w * h;
  const idx = Math.floor(rng() * totalCells);
  return { x: idx % w, y: (idx / w) | 0 };
}

function pf(n: number): string { return (n * 100).toFixed(1).padStart(5) + '%'; }
function pn(n: number, d = 1): string { return n.toFixed(d).padStart(6); }

console.log(`\n=== Topology Experiment — ${new Date().toISOString().slice(0, 10)} ===`);
console.log(`${MAZES_PER_VARIANT} mazes per variant × ${VARIANTS.length} variants × ${SIZES.length} sizes`);
console.log(`Acceptance threshold: ${ACCEPTANCE_THRESHOLD}\n`);

// Print variant legend
console.log('Variants:');
for (const v of VARIANTS) {
  console.log(`  ${v.id.padEnd(3)} bias=${v.newestBias.toFixed(2)} braid=${v.braidFactor.toFixed(2)} start=${v.startMode.padEnd(6)}  ${v.description}`);
}
console.log('');

for (const spec of SIZES) {
  const totalCells = spec.w * spec.h;
  const aspectNote = spec.rectangular
    ? `  [${Math.max(spec.w,spec.h)/Math.min(spec.w,spec.h)}:1]`
    : '';

  console.log(`━━━ ${spec.label}${aspectNote} (${totalCells} cells) ━━━`);
  console.log(
    `  ${'ID'.padEnd(3)} ${'path%p25'.padStart(8)} ${'p50'.padStart(6)} ${'p75'.padStart(6)} ${'p95'.padStart(6)}` +
    ` ${'turns p50'.padStart(9)} ${'xSp p50'.padStart(8)} ${'ySp p50'.padStart(8)} ${'minSp p50'.padStart(9)}` +
    ` ${'fallback%'.padStart(9)} ${'msP50'.padStart(6)}  description`
  );
  console.log('  ' + '─'.repeat(120));

  for (const variant of VARIANTS) {
    const records: VariantRecord[] = [];

    for (let i = 0; i < MAZES_PER_VARIANT; i++) {
      const seed = SEED_BASE + variant.id.charCodeAt(0) * 1000 + (variant.id.charCodeAt(1) || 0) * 100 + i;
      const startCell = resolveStartCell(variant.startMode, spec.w, spec.h, seed);

      const t0 = performance.now();
      const maze = generateMaze({
        width:                  spec.w,
        height:                 spec.h,
        difficulty:             spec.difficulty,
        seed,
        anyPortalSide:          true,
        newestBias:             variant.newestBias,
        braidFactor:            variant.braidFactor,
        experimentalStartCell:  startCell,
      });
      const genMs = performance.now() - t0;

      const sol    = maze.solution;
      const metrics = scoreMetrics(sol, spec.w, spec.h);
      const score  = computeFullScore(metrics, totalCells);
      const { xSpan, ySpan } = computeSpans(sol, spec.w, spec.h);

      records.push({
        pathFraction: sol.length / totalCells,
        turnCount:    metrics.turnCount,
        minSpan:      metrics.minSpan,
        xSpan,
        ySpan,
        score,
        genMs,
      });
    }

    const pf_vals    = records.map(r => r.pathFraction).sort((a,b) => a-b);
    const turn_vals  = records.map(r => r.turnCount).sort((a,b) => a-b);
    const xspan_vals = records.map(r => r.xSpan).sort((a,b) => a-b);
    const yspan_vals = records.map(r => r.ySpan).sort((a,b) => a-b);
    const minspan_vals = records.map(r => r.minSpan).sort((a,b) => a-b);
    const ms_vals    = records.map(r => r.genMs).sort((a,b) => a-b);

    const fallbackCount = records.filter(r => r.score < ACCEPTANCE_THRESHOLD).length;
    const fallbackRate  = fallbackCount / MAZES_PER_VARIANT;

    const [pp25, pp50, pp75, pp95] = [25,50,75,95].map(p => percentile(pf_vals, p));
    const turnP50   = percentile(turn_vals,   50);
    const xspP50    = percentile(xspan_vals,  50);
    const yspP50    = percentile(yspan_vals,  50);
    const minspP50  = percentile(minspan_vals, 50);
    const msP50     = percentile(ms_vals,     50);

    const fbFlag = fallbackRate > 0.15 ? ' ⚠' : '';

    process.stdout.write(
      `  ${variant.id.padEnd(3)} ${pf(pp25)} ${pf(pp50)} ${pf(pp75)} ${pf(pp95)}` +
      ` ${pn(turnP50, 0).padStart(9)} ${pn(xspP50, 3).padStart(8)} ${pn(yspP50, 3).padStart(8)} ${pn(minspP50, 3).padStart(9)}` +
      ` ${pf(fallbackRate).padStart(9)}${fbFlag} ${pn(msP50, 1).padStart(6)}  ${variant.description}\n`
    );
  }

  // Summary: rank variants by path p50 for this size
  const variantSummaries = VARIANTS.map(variant => {
    // Re-derive p50 path from stored records by re-running... but we don't store by variant.
    // Instead, compute rank inline from the already-printed output — just note top 3 by inspection.
    return variant.id;
  });
  console.log('');
}

console.log('=== Experiment complete ===');
console.log('');
console.log('Interpretation guide:');
console.log('  pathFraction p50: target ≥15% for 40×40, ≥12% for 60×60, ≥10% for 80×80, ≥9% for 100×100');
console.log('  minSpan p50:      target ≥0.75 — path should cover both axes');
console.log('  xSpan/ySpan p50:  check for rectangular axis asymmetry; both should be ≥0.75 ideally');
console.log('  fallback%:        target <5%; ⚠ flag at >15%');
console.log('  msP50:            keep <25ms for 100×100 (budget for live slider)');
console.log('');
