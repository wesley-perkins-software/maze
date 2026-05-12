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
import {
  FINISH_MARKER_COLOR,
  MARKER_BADGE_COLOR,
  START_MARKER_CENTER_COLOR,
  START_MARKER_COLOR,
} from '../maze/markerStyles';

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
  width?: string;          // optional SVG width attribute, e.g. "8in"
  height?: string;         // optional SVG height attribute, e.g. "8in"
};

const DEFAULTS = {
  cellSize: 20,
  wallThickness: 2,
  padding: 4,
  showSolution: false,
  solutionColor: '#22c55e',
  bgColor: '#ffffff',
  wallColor: '#1e293b',
  entryColor: START_MARKER_COLOR,
  exitColor: FINISH_MARKER_COLOR,
  markerSize: 0.4,
} satisfies Required<Omit<RenderOptions, 'width' | 'height'>>;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderStartMarker(cx: number, cy: number, r: number, color: string): string {
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${MARKER_BADGE_COLOR}"/>
  <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * 0.78)}" fill="${escapeAttr(color)}" opacity="0.96"/>
  <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * 0.42)}" fill="${START_MARKER_CENTER_COLOR}"/>
  <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * 0.16)}" fill="${escapeAttr(color)}" opacity="0.96"/>`;
}

function renderFinishMarker(cx: number, cy: number, r: number, color: string): string {
  const poleX = cx - r * 0.08;
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${MARKER_BADGE_COLOR}"/>
  <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * 0.78)}" fill="${escapeAttr(color)}" opacity="0.92"/>
  <line x1="${fmt(poleX)}" y1="${fmt(cy + r * 0.46)}" x2="${fmt(poleX)}" y2="${fmt(cy - r * 0.56)}" stroke="white" stroke-width="${fmt(Math.max(1, r * 0.16))}" stroke-linecap="round"/>
  <polygon points="${fmt(poleX)},${fmt(cy - r * 0.56)} ${fmt(cx + r * 0.52)},${fmt(cy - r * 0.26)} ${fmt(poleX)},${fmt(cy + r * 0.05)}" fill="white" opacity="0.95"/>`;
}

export function renderMazeToSVGString(maze: MazeData, opts: RenderOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const { width, height, grid, entry, exit, solution, difficulty, slug } = maze;
  const { cellSize, wallThickness, padding, showSolution } = o;

  const totalW = width  * cellSize + padding * 2;
  const totalH = height * cellSize + padding * 2;
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
  const markerR = (cellSize * o.markerSize) / 2;

  const entryCx = padding + entry.x * cellSize + cellSize / 2;
  const entryCy = padding + entry.y * cellSize + cellSize / 2;
  const exitCx  = padding + exit.x  * cellSize + cellSize / 2;
  const exitCy  = padding + exit.y  * cellSize + cellSize / 2;

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
  const title = escapeAttr(slug ? slug.replace(/-/g, ' ') : label);
  const sizeAttrs = `${o.width ? ` width="${escapeAttr(o.width)}"` : ''}${o.height ? ` height="${escapeAttr(o.height)}"` : ''}`;

  return `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttrs} viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(label)}">
  <title>${title}</title>
  <desc>A printable ${label}. Print or solve online at MazeThis.</desc>
  <rect width="${totalW}" height="${totalH}" fill="${o.bgColor}"/>
  ${solutionPath}
  <path d="${wallSegments.join(' ')}" stroke="${o.wallColor}" stroke-width="${wallThickness}" stroke-linecap="square" fill="none"/>
  ${renderStartMarker(entryCx, entryCy, markerR, o.entryColor)}
  ${renderFinishMarker(exitCx, exitCy, markerR, o.exitColor)}
</svg>`;
}

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * Generate a clean, scalable SVG artwork asset for user downloads.
 *
 * Unlike the browser print view, this is not a page-sized layout. It measures
 * the maze artwork itself, includes stroke/marker extents, then adds a modest
 * equal pad around those bounds so Quick Look, desktop previews, vector editors,
 * and print dialogs all open the file as centered maze artwork rather than as a
 * small object on a tall page canvas.
 */
export function renderDownloadSVG(maze: MazeData): string {
  const { width, height, grid, entry, exit, difficulty, slug } = maze;
  const targetMazeEdge = 960;
  const cellSize = targetMazeEdge / Math.max(width, height);
  const wallThickness = Math.max(1.75, Math.min(3.5, cellSize * 0.16));
  const markerSize = cellSize * DEFAULTS.markerSize;
  const markerOffset = (cellSize - markerSize) / 2;
  const halfStroke = wallThickness / 2;
  const exportPadding = Math.max(18, wallThickness * 6, targetMazeEdge * 0.035);

  const mazeW = width * cellSize;
  const mazeH = height * cellSize;
  const wallSegments: string[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = grid[idx];
      const px = x * cellSize;
      const py = y * cellSize;

      if (cell & WALL_N) wallSegments.push(`M${fmt(px)},${fmt(py)} L${fmt(px + cellSize)},${fmt(py)}`);
      if (cell & WALL_W) wallSegments.push(`M${fmt(px)},${fmt(py)} L${fmt(px)},${fmt(py + cellSize)}`);

      if (x === width - 1 && (cell & WALL_E)) {
        wallSegments.push(`M${fmt(px + cellSize)},${fmt(py)} L${fmt(px + cellSize)},${fmt(py + cellSize)}`);
      }
      if (y === height - 1 && (cell & WALL_S)) {
        wallSegments.push(`M${fmt(px)},${fmt(py + cellSize)} L${fmt(px + cellSize)},${fmt(py + cellSize)}`);
      }
    }
  }

  const entryX = entry.x * cellSize + markerOffset;
  const entryY = entry.y * cellSize + markerOffset;
  const exitX = exit.x * cellSize + markerOffset;
  const exitY = exit.y * cellSize + markerOffset;

  const artworkMinX = Math.min(-halfStroke, entryX, exitX);
  const artworkMinY = Math.min(-halfStroke, entryY, exitY);
  const artworkMaxX = Math.max(mazeW + halfStroke, entryX + markerSize, exitX + markerSize);
  const artworkMaxY = Math.max(mazeH + halfStroke, entryY + markerSize, exitY + markerSize);
  const viewBoxX = artworkMinX - exportPadding;
  const viewBoxY = artworkMinY - exportPadding;
  const viewBoxW = artworkMaxX - artworkMinX + exportPadding * 2;
  const viewBoxH = artworkMaxY - artworkMinY + exportPadding * 2;

  const label = `${difficulty} ${width}×${height} maze`;
  const title = escapeAttr(slug ? slug.replace(/-/g, ' ') : label);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(viewBoxX)} ${fmt(viewBoxY)} ${fmt(viewBoxW)} ${fmt(viewBoxH)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(label)}">
  <title>${title}</title>
  <desc>A clean downloadable ${label} artwork asset.</desc>
  <rect x="${fmt(viewBoxX)}" y="${fmt(viewBoxY)}" width="${fmt(viewBoxW)}" height="${fmt(viewBoxH)}" fill="${DEFAULTS.bgColor}"/>
  <path d="${wallSegments.join(' ')}" stroke="${DEFAULTS.wallColor}" stroke-width="${fmt(wallThickness)}" stroke-linecap="square" fill="none"/>
  ${renderStartMarker(entryX + markerSize / 2, entryY + markerSize / 2, markerSize / 2, DEFAULTS.entryColor)}
  ${renderFinishMarker(exitX + markerSize / 2, exitY + markerSize / 2, markerSize / 2, DEFAULTS.exitColor)}
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
