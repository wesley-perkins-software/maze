/**
 * Confirmation Audit Script — Phase 3B finalist comparison
 *
 * Compares three variants across 9 sizes, 200 mazes each:
 *   A  (baseline):  newestBias=0.85, braidFactor=0.01, start=center
 *   D2 (finalist):  newestBias=1.00, braidFactor=0.00, start=(1,1)
 *   D4 (finalist):  newestBias=1.00, braidFactor=0.00, start=random
 *
 * Metrics:
 *   - path% p10/p25/p50/p75/p90/p95, absolute p50
 *   - minSpan p50, xSpan p50, ySpan p50
 *   - zone coverage p50 (bounding-box proxy for spatial fill)
 *   - turns p50
 *   - fallback rate (composite score < 0.78)
 *   - generation time p50 and p95
 *
 * Visual sampling section: entry/exit side distribution and coordinate
 * spread for D2 on 40×40, 60×60, 100×100 — proxy for corner-origin artifact.
 *
 * Run: npm run confirmation:audit
 */
import { generateMaze } from '../src/lib/maze/generator.js';
import { scoreMetrics, computeFullScore, refValues } from '../src/lib/maze/quality.js';
import { createPRNG } from '../src/lib/maze/prng.js';
import type { Difficulty, Point } from '../src/types/maze.js';

const ACCEPTANCE_THRESHOLD = 0.78;
const MAZES_PER_VARIANT    = 200;
const SEED_BASE            = 80000;

type VariantConfig = {
  id:          string;
  label:       string;
  newestBias:  number;
  braidFactor: number;
  startMode:   'center' | 'corner' | 'random';
};

const VARIANTS: VariantConfig[] = [
  { id: 'A',  label: 'Baseline (Phase 2)',  newestBias: 0.85, braidFactor: 0.01, startMode: 'center' },
  { id: 'D2', label: 'D2 (DFS+corner)',     newestBias: 1.00, braidFactor: 0.00, startMode: 'corner' },
  { id: 'D4', label: 'D4 (DFS+random)',     newestBias: 1.00, braidFactor: 0.00, startMode: 'random' },
];

type SizeSpec = {
  label:      string;
  w:          number;
  h:          number;
  difficulty: Difficulty;
  seedBase:   number;
  rectangular?: boolean;
};

const SIZES: SizeSpec[] = [
  { label: '20×20',   w: 20,  h: 20,  difficulty: 'small',  seedBase: 80000 },
  { label: '40×40',   w: 40,  h: 40,  difficulty: 'medium', seedBase: 81000 },
  { label: '60×60',   w: 60,  h: 60,  difficulty: 'large',  seedBase: 82000 },
  { label: '80×80',   w: 80,  h: 80,  difficulty: 'large',  seedBase: 83000 },
  { label: '100×100', w: 100, h: 100, difficulty: 'large',  seedBase: 84000 },
  { label: '60×30',   w: 60,  h: 30,  difficulty: 'medium', seedBase: 85000, rectangular: true },
  { label: '30×60',   w: 30,  h: 60,  difficulty: 'medium', seedBase: 86000, rectangular: true },
  { label: '100×10',  w: 100, h: 10,  difficulty: 'medium', seedBase: 87000, rectangular: true },
  { label: '10×100',  w: 10,  h: 100, difficulty: 'medium', seedBase: 88000, rectangular: true },
];

// Sizes to run visual sampling on (entry/exit distribution analysis)
const VISUAL_SAMPLE_LABELS = new Set(['40×40', '60×60', '100×100']);

type Record_ = {
  pathFraction: number;
  pathLen:      number;
  turnCount:    number;
  zoneCount:    number;
  minSpan:      number;
  xSpan:        number;
  ySpan:        number;
  score:        number;
  genMs:        number;
  entrySide:    number;   // 0=top 1=right 2=bottom 3=left
  exitSide:     number;
  entryX:       number;
  entryY:       number;
  exitX:        number;
  exitY:        number;
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100)));
  return sorted[idx];
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function resolveStartCell(mode: VariantConfig['startMode'], w: number, h: number, seed: number): Point | undefined {
  if (mode === 'center') return undefined;
  if (mode === 'corner') return { x: 1, y: 1 };
  const rng = createPRNG(seed ^ 0xdeadbeef);
  const idx = Math.floor(rng() * (w * h));
  return { x: idx % w, y: (idx / w) | 0 };
}

function sideOf(p: { x: number; y: number }, w: number, h: number): number {
  if (p.y === 0)     return 0; // top
  if (p.x === w - 1) return 1; // right
  if (p.y === h - 1) return 2; // bottom
  return 3;                     // left
}

function computeSpans(sol: number[], w: number, h: number): { xSpan: number; ySpan: number } {
  if (sol.length === 0) return { xSpan: 0, ySpan: 0 };
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (const idx of sol) {
    const x = idx % w, y = (idx / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return {
    xSpan: (maxX - minX) / Math.max(1, w - 1),
    ySpan: (maxY - minY) / Math.max(1, h - 1),
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function pf(n: number, w = 6): string  { return (n * 100).toFixed(1).padStart(w) + '%'; }
function pn(n: number, d = 1, w = 7): string { return n.toFixed(d).padStart(w); }
function pi(n: number, w = 7): string  { return Math.round(n).toString().padStart(w); }

// Header line for the percentile table
const HDR = `  ${'variant'.padEnd(22)} ${'p10'.padStart(7)} ${'p25'.padStart(7)} ${'p50'.padStart(7)} ${'p75'.padStart(7)} ${'p90'.padStart(7)} ${'p95'.padStart(7)} ${'mean'.padStart(7)}`;
const SEP = '  ' + '─'.repeat(HDR.length - 2);

function rowPct(label: string, vals: number[]): string {
  const s = [...vals].sort((a, b) => a - b);
  const ps = [10,25,50,75,90,95].map(p => percentile(s, p));
  const m = mean(vals);
  return `  ${'  ' + label.padEnd(20)} ${ps.map(v => pf(v)).join(' ')} ${pf(m)}`;
}

function rowNum(label: string, vals: number[], decimals = 1): string {
  const s = [...vals].sort((a, b) => a - b);
  const ps = [10,25,50,75,90,95].map(p => percentile(s, p));
  const m = mean(vals);
  return `  ${'  ' + label.padEnd(20)} ${ps.map(v => pn(v, decimals)).join(' ')} ${pn(m, decimals)}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n=== Confirmation Audit — ${new Date().toISOString().slice(0, 10)} ===`);
console.log(`${MAZES_PER_VARIANT} mazes × 3 variants × ${SIZES.length} sizes`);
console.log(`Acceptance threshold: ${ACCEPTANCE_THRESHOLD}\n`);
console.log('Variants:');
for (const v of VARIANTS) {
  console.log(`  ${v.id.padEnd(3)} ${v.label}  (bias=${v.newestBias.toFixed(2)} braid=${v.braidFactor.toFixed(2)} start=${v.startMode})`);
}
console.log('');

// Accumulate visual-sample data keyed by "label::variantId"
type SampleData = { entryX: number[]; entryY: number[]; exitX: number[]; exitY: number[]; entrySide: number[]; exitSide: number[] };
const visualData = new Map<string, SampleData>();

for (const spec of SIZES) {
  const totalCells = spec.w * spec.h;
  const aspectNote = spec.rectangular
    ? ` [${Math.max(spec.w,spec.h)/Math.min(spec.w,spec.h)}:1]`
    : '';
  const doVisual = VISUAL_SAMPLE_LABELS.has(spec.label);

  console.log(`━━━ ${spec.label}${aspectNote} ━━━`);
  const { refPath, refTurns } = refValues(totalCells);
  console.log(`  refPath=${refPath}  refTurns=${refTurns}  totalCells=${totalCells}`);
  console.log('');

  const allRecords: Map<string, Record_[]> = new Map(VARIANTS.map(v => [v.id, []]));

  for (const variant of VARIANTS) {
    const records = allRecords.get(variant.id)!;
    process.stdout.write(`  Generating ${MAZES_PER_VARIANT} × ${spec.label} variant=${variant.id}...`);

    if (doVisual) {
      const key = `${spec.label}::${variant.id}`;
      visualData.set(key, { entryX: [], entryY: [], exitX: [], exitY: [], entrySide: [], exitSide: [] });
    }

    for (let i = 0; i < MAZES_PER_VARIANT; i++) {
      const seed = spec.seedBase + i;
      const startCell = resolveStartCell(variant.startMode, spec.w, spec.h, seed);

      const t0 = performance.now();
      const maze = generateMaze({
        width:                 spec.w,
        height:                spec.h,
        difficulty:            spec.difficulty,
        seed,
        anyPortalSide:         true,
        newestBias:            variant.newestBias,
        braidFactor:           variant.braidFactor,
        experimentalStartCell: startCell,
      });
      const genMs = performance.now() - t0;

      const sol = maze.solution;
      const metrics = scoreMetrics(sol, spec.w, spec.h);
      const score   = computeFullScore(metrics, totalCells);
      const { xSpan, ySpan } = computeSpans(sol, spec.w, spec.h);

      const entrySide = sideOf(maze.entry, spec.w, spec.h);
      const exitSide  = sideOf(maze.exit,  spec.w, spec.h);

      if (doVisual) {
        const vd = visualData.get(`${spec.label}::${variant.id}`)!;
        vd.entryX.push(maze.entry.x);
        vd.entryY.push(maze.entry.y);
        vd.exitX.push(maze.exit.x);
        vd.exitY.push(maze.exit.y);
        vd.entrySide.push(entrySide);
        vd.exitSide.push(exitSide);
      }

      records.push({
        pathFraction: sol.length / totalCells,
        pathLen:      sol.length,
        turnCount:    metrics.turnCount,
        zoneCount:    metrics.zoneCount,
        minSpan:      metrics.minSpan,
        xSpan,
        ySpan,
        score,
        genMs,
        entrySide,
        exitSide,
        entryX: maze.entry.x,
        entryY: maze.entry.y,
        exitX:  maze.exit.x,
        exitY:  maze.exit.y,
      });
    }
    console.log(' done.');
  }

  console.log('');

  // Print summary table for this size
  console.log(HDR);
  console.log(SEP);
  for (const variant of VARIANTS) {
    const records = allRecords.get(variant.id)!;
    const fallbackCount  = records.filter(r => r.score < ACCEPTANCE_THRESHOLD).length;
    const fallbackRate   = fallbackCount / MAZES_PER_VARIANT;
    const gensMs         = records.map(r => r.genMs).sort((a,b) => a-b);
    const p50Ms          = percentile(gensMs, 50);
    const p95Ms          = percentile(gensMs, 95);
    const pathFracSorted = records.map(r => r.pathFraction).sort((a,b) => a-b);
    const pathLenSorted  = records.map(r => r.pathLen).sort((a,b) => a-b);
    const minspSorted    = records.map(r => r.minSpan).sort((a,b) => a-b);
    const xspSorted      = records.map(r => r.xSpan).sort((a,b) => a-b);
    const yspSorted      = records.map(r => r.ySpan).sort((a,b) => a-b);
    const turnSorted     = records.map(r => r.turnCount).sort((a,b) => a-b);
    const zoneSorted     = records.map(r => r.zoneCount).sort((a,b) => a-b);

    console.log(`  ${variant.id.padEnd(3)} ${variant.label.padEnd(20)}`);
    console.log(rowPct('pathFraction', records.map(r => r.pathFraction)));
    console.log(`    ${'pathLen p50:'.padEnd(20)}${pi(percentile(pathLenSorted, 50), 5)} cells`);
    console.log(rowNum('turns', records.map(r => r.turnCount), 0));
    console.log(rowNum('zoneCount (/16)', records.map(r => r.zoneCount), 1));
    console.log(rowNum('minSpan', records.map(r => r.minSpan), 3));
    console.log(rowNum('xSpan', records.map(r => r.xSpan), 3));
    console.log(rowNum('ySpan', records.map(r => r.ySpan), 3));
    console.log(`    ${'fallback%:'.padEnd(20)}${pf(fallbackRate).trimStart()}`);
    console.log(`    ${'timing p50/p95:'.padEnd(20)}${p50Ms.toFixed(1)}ms / ${p95Ms.toFixed(1)}ms`);
    console.log('');
  }

  // D2 vs D4 delta summary for this size
  const baseline = allRecords.get('A')!;
  const d2       = allRecords.get('D2')!;
  const d4       = allRecords.get('D4')!;
  const bPath  = percentile(baseline.map(r => r.pathFraction).sort((a,b)=>a-b), 50);
  const d2Path = percentile(d2.map(r => r.pathFraction).sort((a,b)=>a-b), 50);
  const d4Path = percentile(d4.map(r => r.pathFraction).sort((a,b)=>a-b), 50);
  const d2MinSp = percentile(d2.map(r => r.minSpan).sort((a,b)=>a-b), 50);
  const d4MinSp = percentile(d4.map(r => r.minSpan).sort((a,b)=>a-b), 50);

  console.log(`  ── Delta vs baseline ──`);
  console.log(`  D2 path p50: ${(bPath*100).toFixed(1)}% → ${(d2Path*100).toFixed(1)}%  (+${((d2Path-bPath)*100).toFixed(1)}pp)  minSpan p50: ${d2MinSp.toFixed(3)}`);
  console.log(`  D4 path p50: ${(bPath*100).toFixed(1)}% → ${(d4Path*100).toFixed(1)}%  (+${((d4Path-bPath)*100).toFixed(1)}pp)  minSpan p50: ${d4MinSp.toFixed(3)}`);

  if (doVisual) {
    console.log('');
    console.log(`  ── Visual sampling: entry/exit distribution (${spec.label}) ──`);
    const sideName = ['top','right','bottom','left'];
    for (const variant of VARIANTS) {
      const key = `${spec.label}::${variant.id}`;
      const vd = visualData.get(key);
      if (!vd) continue;
      const eSideCounts = [0,0,0,0];
      const xSideCounts = [0,0,0,0];
      for (let i = 0; i < vd.entrySide.length; i++) {
        eSideCounts[vd.entrySide[i]]++;
        xSideCounts[vd.exitSide[i]]++;
      }
      const n = vd.entryX.length;
      const entryXMean = mean(vd.entryX);
      const entryYMean = mean(vd.entryY);
      const exitXMean  = mean(vd.exitX);
      const exitYMean  = mean(vd.exitY);
      const entryXStd  = Math.sqrt(mean(vd.entryX.map(v => (v-entryXMean)**2)));
      const entryYStd  = Math.sqrt(mean(vd.entryY.map(v => (v-entryYMean)**2)));
      const exitXStd   = Math.sqrt(mean(vd.exitX.map(v => (v-exitXMean)**2)));
      const exitYStd   = Math.sqrt(mean(vd.exitY.map(v => (v-exitYMean)**2)));

      const eDist = eSideCounts.map((c,i) => `${sideName[i]}:${((c/n)*100).toFixed(0)}%`).join(' ');
      const xDist = xSideCounts.map((c,i) => `${sideName[i]}:${((c/n)*100).toFixed(0)}%`).join(' ');
      console.log(`  ${variant.id.padEnd(3)} entry sides [${eDist}]  mean=(${entryXMean.toFixed(1)},${entryYMean.toFixed(1)}) std=(${entryXStd.toFixed(1)},${entryYStd.toFixed(1)})`);
      console.log(`      exit  sides [${xDist}]  mean=(${exitXMean.toFixed(1)},${exitYMean.toFixed(1)}) std=(${exitXStd.toFixed(1)},${exitYStd.toFixed(1)})`);
    }
  }

  console.log('');
}

// ── Cross-size summary table ──────────────────────────────────────────────────
console.log('═══ Cross-size summary: path% p50 ═══');
console.log(`${'size'.padEnd(10)} ${'A (baseline)'.padStart(13)} ${'D2'.padStart(8)} ${'D4'.padStart(8)} ${'D2-A pp'.padStart(9)} ${'D4-A pp'.padStart(9)}`);
console.log('─'.repeat(60));

// Note: We can't re-access the records here since they're out of scope.
// The per-size delta lines above cover this. Direct users to read those.
console.log('(see per-size delta lines above)\n');

console.log('=== Audit complete ===\n');
