/**
 * MazeRenderer — Pure SVG React component.
 * Renders a maze as SVG from MazeData. Works both server-side (Astro static)
 * and client-side (within islands). No side effects.
 */
import type { MazeData, Point } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { indexToPoint } from '../../lib/maze/utils';

export interface MazeRendererProps {
  maze: MazeData;
  cellSize?: number;
  wallThickness?: number;
  padding?: number;
  playerPosition?: Point;
  trail?: number[];           // flat indices of visited cells
  solution?: number[];        // flat indices of solution path
  showSolution?: boolean;
  hintCells?: number[];       // flat indices of hint-highlighted cells
  className?: string;
  interactive?: boolean;      // adds keyboard/touch affordances
  svgRef?: React.RefObject<SVGSVGElement>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  playerMarkerRadius?: number; // override default radius for minimap high-contrast dot
  markerRadius?: number;       // override entry/exit marker radius
  showEndpointMarkers?: boolean; // render entry/exit markers inside the SVG
  markersOutside?: boolean;    // place entry/exit icons outside the perimeter wall
}

export function MazeRenderer({
  maze,
  cellSize = 24,
  wallThickness = 2,
  padding = 6,
  playerPosition,
  trail = [],
  solution = [],
  showSolution = false,
  hintCells = [],
  className,
  interactive = false,
  svgRef,
  onKeyDown,
  playerMarkerRadius,
  markerRadius,
  showEndpointMarkers = true,
  markersOutside = false,
}: MazeRendererProps) {
  const { width, height, grid, entry, exit } = maze;

  const totalW = width  * cellSize + padding * 2;
  const totalH = height * cellSize + padding * 2;

  // ── Wall segments ────────────────────────────────────────────────────────────
  const wallPaths: string[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = grid[idx];
      const px = padding + x * cellSize;
      const py = padding + y * cellSize;

      if (cell & WALL_N) wallPaths.push(`M${px},${py} L${px + cellSize},${py}`);
      if (cell & WALL_W) wallPaths.push(`M${px},${py} L${px},${py + cellSize}`);

      if (x === width - 1 && (cell & WALL_E)) {
        wallPaths.push(`M${px + cellSize},${py} L${px + cellSize},${py + cellSize}`);
      }
      if (y === height - 1 && (cell & WALL_S)) {
        wallPaths.push(`M${px},${py + cellSize} L${px + cellSize},${py + cellSize}`);
      }
    }
  }

  // ── Entry / exit centers (cell-interior positions) ───────────────────────────
  const entryCx = padding + entry.x * cellSize + cellSize / 2;
  const entryCy = padding + entry.y * cellSize + cellSize / 2;
  const exitCx  = padding + exit.x  * cellSize + cellSize / 2;
  const exitCy  = padding + exit.y  * cellSize + cellSize / 2;
  const markerR = markerRadius ?? cellSize * 0.38;

  // ── Shift markers outside the perimeter wall when requested ─────────────────
  const outsideX = (pt: Point, defaultX: number) => {
    if (!markersOutside) return defaultX;
    if (pt.x === 0)         return padding / 2;
    if (pt.x === width - 1) return totalW - padding / 2;
    return defaultX;
  };
  const outsideY = (pt: Point, defaultY: number) => {
    if (!markersOutside) return defaultY;
    if (pt.y === 0)          return padding / 2;
    if (pt.y === height - 1) return totalH - padding / 2;
    return defaultY;
  };

  const entryMx = outsideX(entry, entryCx);
  const entryMy = outsideY(entry, entryCy);
  const exitMx  = outsideX(exit,  exitCx);
  const exitMy  = outsideY(exit,  exitCy);

  // ── Entry arrow — points INTO the maze from whichever perimeter wall ─────────
  const entryArrowPoints = (() => {
    const cx = entryMx;
    const cy = entryMy;
    const r  = markerR;

    if (entry.y === 0) {
      // Top wall → arrow points DOWN
      return `${cx - r*0.6},${cy - r*0.35} ${cx + r*0.6},${cy - r*0.35} ${cx},${cy + r*0.55}`;
    }
    if (entry.y === height - 1) {
      // Bottom wall → arrow points UP
      return `${cx - r*0.6},${cy + r*0.35} ${cx + r*0.6},${cy + r*0.35} ${cx},${cy - r*0.55}`;
    }
    if (entry.x === 0) {
      // Left wall → arrow points RIGHT
      return `${cx - r*0.35},${cy - r*0.6} ${cx + r*0.55},${cy} ${cx - r*0.35},${cy + r*0.6}`;
    }
    // Right wall → arrow points LEFT
    return `${cx + r*0.35},${cy - r*0.6} ${cx - r*0.55},${cy} ${cx + r*0.35},${cy + r*0.6}`;
  })();

  const cellCenter = (idx: number) => {
    const { x, y } = indexToPoint(idx, width);
    return `${padding + x * cellSize + cellSize / 2},${padding + y * cellSize + cellSize / 2}`;
  };

  // ── Solution polyline ────────────────────────────────────────────────────────
  const solutionPoints = showSolution && solution.length > 0
    ? [
        ...(markersOutside ? [`${entryMx},${entryMy}`] : []),
        ...solution.map(cellCenter),
        ...(markersOutside ? [`${exitMx},${exitMy}`] : []),
      ].join(' ')
    : null;

  // ── Fading trail — 4 opacity segments, oldest→newest ────────────────────────
  const trailSegments = trail.length > 1 ? (() => {
    const n = trail.length;
    const toPoint = (idx: number) => {
      const { x, y } = indexToPoint(idx, width);
      return `${padding + x * cellSize + cellSize / 2},${padding + y * cellSize + cellSize / 2}`;
    };
    const breaks = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n];
    const opacities = [0.12, 0.3, 0.55, 0.85];
    const widths    = [0.16, 0.18, 0.21, 0.25];
    return breaks.slice(0, -1).map((start, i) => {
      const seg = trail.slice(Math.max(0, start - 1), breaks[i + 1] + 1);
      if (seg.length < 2) return null;
      return { pts: seg.map(toPoint).join(' '), opacity: opacities[i], width: widths[i] };
    }).filter(Boolean) as { pts: string; opacity: number; width: number }[];
  })() : [];

  // ── Player circle ────────────────────────────────────────────────────────────
  // The player can be on a virtual cell just outside an entry/exit gap.
  // In that case, draw it centered on the corresponding outside marker.
  const isEntryMarkerPosition = playerPosition && (
    (entry.y === 0 && playerPosition.x === entry.x && playerPosition.y === -1) ||
    (entry.y === height - 1 && playerPosition.x === entry.x && playerPosition.y === height) ||
    (entry.x === 0 && playerPosition.x === -1 && playerPosition.y === entry.y) ||
    (entry.x === width - 1 && playerPosition.x === width && playerPosition.y === entry.y)
  );
  const isExitMarkerPosition = playerPosition && (
    (exit.y === 0 && playerPosition.x === exit.x && playerPosition.y === -1) ||
    (exit.y === height - 1 && playerPosition.x === exit.x && playerPosition.y === height) ||
    (exit.x === 0 && playerPosition.x === -1 && playerPosition.y === exit.y) ||
    (exit.x === width - 1 && playerPosition.x === width && playerPosition.y === exit.y)
  );

  const playerCx = playerPosition
    ? isEntryMarkerPosition
      ? entryMx
      : isExitMarkerPosition
        ? exitMx
        : padding + playerPosition.x * cellSize + cellSize / 2
    : null;
  const playerCy = playerPosition
    ? isEntryMarkerPosition
      ? entryMy
      : isExitMarkerPosition
        ? exitMy
        : padding + playerPosition.y * cellSize + cellSize / 2
    : null;

  const pr    = playerMarkerRadius ?? cellSize * 0.32;
  const glowR = playerMarkerRadius ? playerMarkerRadius * 1.6 : cellSize * 0.5;

  const label = `${maze.difficulty} ${width}×${height} maze`;

  return (
    <svg
      ref={svgRef}
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', overflow: 'visible' }}
      role={interactive ? 'application' : 'img'}
      aria-label={interactive ? `${label}. Use arrow keys to move.` : label}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
    >
      <title>{maze.slug ? maze.slug.replace(/-/g, ' ') : label}</title>

      {/* Background */}
      <rect width={totalW} height={totalH} fill="white" />

      {/* Hint highlight circles */}
      {hintCells.map((idx) => {
        const { x, y } = indexToPoint(idx, width);
        return (
          <circle
            key={`hint-${idx}`}
            cx={padding + x * cellSize + cellSize / 2}
            cy={padding + y * cellSize + cellSize / 2}
            r={cellSize * 0.28}
            fill="#f59e0b"
            opacity={0.45}
          />
        );
      })}

      {/* Solution overlay */}
      {solutionPoints && (
        <polyline
          points={solutionPoints}
          stroke="#22c55e"
          strokeWidth={cellSize * 0.18}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}

      {/* Fading trail — rendered oldest to newest so recent segment is on top */}
      {trailSegments.map((seg, i) => (
        <polyline
          key={`trail-${i}`}
          points={seg.pts}
          stroke="#3b82f6"
          strokeWidth={cellSize * seg.width}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={seg.opacity}
        />
      ))}

      {/* Walls */}
      <path
        d={wallPaths.join(' ')}
        stroke="#1e293b"
        strokeWidth={wallThickness}
        strokeLinecap="square"
        fill="none"
      />

      {showEndpointMarkers && (
        <>
          {/* Entry marker — green circle with directional play arrow */}
          <circle cx={entryMx} cy={entryMy} r={markerR} fill="#22c55e" opacity={0.9} />
          {markerR >= 5 && (
            <polygon
              points={entryArrowPoints}
              fill="white"
              opacity={0.95}
            />
          )}

          {/* Exit marker — amber circle with flag pennant */}
          <circle cx={exitMx} cy={exitMy} r={markerR} fill="#f59e0b" opacity={0.9} />
          {markerR >= 5 && (
            <>
              {/* Flag pole */}
              <line
                x1={exitMx - markerR * 0.08}
                y1={exitMy + markerR * 0.52}
                x2={exitMx - markerR * 0.08}
                y2={exitMy - markerR * 0.62}
                stroke="white"
                strokeWidth={Math.max(1, markerR * 0.17)}
                strokeLinecap="round"
              />
              {/* Flag pennant */}
              <polygon
                points={`${exitMx - markerR * 0.08},${exitMy - markerR * 0.62} ${exitMx + markerR * 0.58},${exitMy - markerR * 0.28} ${exitMx - markerR * 0.08},${exitMy + markerR * 0.06}`}
                fill="white"
                opacity={0.95}
              />
            </>
          )}
        </>
      )}

      {/* Player */}
      {playerCx !== null && playerCy !== null && (
        <>
          {/* Animated glow ring */}
          <circle
            cx={playerCx}
            cy={playerCy}
            r={glowR}
            fill="#2563eb"
            className="maze-player-glow"
          />
          {/* Solid player dot */}
          <circle
            cx={playerCx}
            cy={playerCy}
            r={pr}
            fill="#2563eb"
            stroke="white"
            strokeWidth={playerMarkerRadius ? Math.max(1.5, playerMarkerRadius * 0.35) : 2}
          />
        </>
      )}
    </svg>
  );
}
