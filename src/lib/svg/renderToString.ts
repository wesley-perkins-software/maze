/**
 * Server-side SVG renderer — pure string output, no DOM.
 * Used at build time for:
 *   • MazeCard thumbnails (inlined HTML)
 *   • Print page SVG
 *   • OG image generation input
 */
import type { MazeData } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { indexToPoint } from '../maze/utils';

export type RenderOptions = {
  cellSize?: number;       // px per cell, default 20
  wallThickness?: number;  // stroke width, default 2
  padding?: number;        // extra space around maze, default 4
  showSolution?: boolean;
  solutionColor?: string;
  bgColor?: string;
  wallColor?: string;
  entryColor?: string;
  exitColor?: string;
  markerSize?: number;     // entry/exit marker size as fraction of cellSize, default 0.4
};

const DEFAULTS: Required<RenderOptions> = {
  cellSize: 20,
  wallThickness: 2,
  padding: 4,
  showSolution: false,
  solutionColor: '#22c55e',
  bgColor: '#ffffff',
  wallColor: '#1e293b',
  entryColor: '#64748b',
  exitColor: '#f59e0b',
  markerSize: 0.4,
};

export function renderMazeToSVGString(maze: MazeData, opts: RenderOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const { width, height, grid, entry, exit, solution, difficulty, slug } = maze;
  const { cellSize, wallThickness, padding, showSolution } = o;

  const totalW = width  * cellSize + padding * 2;
  const totalH = height * cellSize + padding * 2;
  const half = wallThickness / 2;

  // ── Wall path computation ────────────────────────────────────────────────────
  const wallSegments: string[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = grid[idx];
      const px = padding + x * cellSize;
      const py = padding + y * cellSize;

      // Only draw North and West walls per cell to avoid double-drawing.
      // Border walls are always added for outermost cells.

      if (cell & WALL_N) {
        // North wall: horizontal line at top of cell
        const x1 = px;
        const x2 = px + cellSize;
        const yc = py;
        wallSegments.push(`M${x1},${yc} L${x2},${yc}`);
      }

      if (cell & WALL_W) {
        // West wall: vertical line at left of cell
        const xc = px;
        const y1 = py;
        const y2 = py + cellSize;
        wallSegments.push(`M${xc},${y1} L${xc},${y2}`);
      }

      // East wall for rightmost column
      if (x === width - 1 && (cell & WALL_E)) {
        const xc = px + cellSize;
        wallSegments.push(`M${xc},${py} L${xc},${py + cellSize}`);
      }

      // South wall for bottom row
      if (y === height - 1 && (cell & WALL_S)) {
        const yc = py + cellSize;
        wallSegments.push(`M${px},${yc} L${px + cellSize},${yc}`);
      }
    }
  }

  // ── Entry / Exit markers ─────────────────────────────────────────────────────
  const ms = cellSize * o.markerSize;
  const mOff = (cellSize - ms) / 2;

  const entryPx = padding + entry.x * cellSize + mOff;
  const entryPy = padding + entry.y * cellSize + mOff;
  const exitPx  = padding + exit.x  * cellSize + mOff;
  const exitPy  = padding + exit.y  * cellSize + mOff;

  // ── Solution path ────────────────────────────────────────────────────────────
  let solutionPath = '';
  if (showSolution && solution.length > 0) {
    const pts = solution
      .map((idx) => {
        const { x, y } = indexToPoint(idx, width);
        const cx = padding + x * cellSize + cellSize / 2;
        const cy = padding + y * cellSize + cellSize / 2;
        return `${cx},${cy}`;
      })
      .join(' ');
    solutionPath = `<polyline points="${pts}" stroke="${o.solutionColor}" stroke-width="${cellSize * 0.18}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
  }

  // ── Assemble SVG ─────────────────────────────────────────────────────────────
  const label = `${difficulty} ${width}×${height} maze`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" role="img" aria-label="${label}">
  <title>${slug ? slug.replace(/-/g, ' ') : label}</title>
  <desc>A printable ${label}. Print or solve online at MazeThis.</desc>
  <rect width="${totalW}" height="${totalH}" fill="${o.bgColor}"/>
  ${solutionPath}
  <path d="${wallSegments.join(' ')}" stroke="${o.wallColor}" stroke-width="${wallThickness}" stroke-linecap="square" fill="none"/>
  <rect x="${entryPx}" y="${entryPy}" width="${ms}" height="${ms}" rx="${ms * 0.2}" fill="${o.entryColor}" opacity="0.8"/>
  <rect x="${exitPx}"  y="${exitPy}"  width="${ms}" height="${ms}" rx="${ms * 0.2}" fill="${o.exitColor}"  opacity="0.8"/>
</svg>`;
}

/**
 * Generate a compact thumbnail SVG (smaller cell size, no solution).
 */
export function renderThumbnail(maze: MazeData): string {
  return renderMazeToSVGString(maze, {
    cellSize: 10,
    wallThickness: 1.5,
    padding: 2,
    showSolution: false,
  });
}

/**
 * Generate a full-size print SVG (larger cells, clean output).
 */
export function renderPrint(maze: MazeData): string {
  // Scale cell size so maze fills roughly 500px wide
  const cellSize = Math.max(16, Math.min(40, Math.floor(500 / maze.width)));
  return renderMazeToSVGString(maze, {
    cellSize,
    wallThickness: 2,
    padding: 20,
    showSolution: false,
  });
}
