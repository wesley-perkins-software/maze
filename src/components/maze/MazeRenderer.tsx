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

  // ── Entry / exit centers ─────────────────────────────────────────────────────
  const entryCx = padding + entry.x * cellSize + cellSize / 2;
  const entryCy = padding + entry.y * cellSize + cellSize / 2;
  let exitCx  = padding + exit.x  * cellSize + cellSize / 2;
  let exitCy  = padding + exit.y  * cellSize + cellSize / 2;
  const exitCell = grid[exit.y * width + exit.x];
  const exitOutsideOffset = cellSize * 0.62;

  // Draw exit marker outside the maze boundary opening when possible.
  if (exit.y === 0 && !(exitCell & WALL_N)) exitCy -= exitOutsideOffset;
  else if (exit.y === height - 1 && !(exitCell & WALL_S)) exitCy += exitOutsideOffset;
  else if (exit.x === 0 && !(exitCell & WALL_W)) exitCx -= exitOutsideOffset;
  else if (exit.x === width - 1 && !(exitCell & WALL_E)) exitCx += exitOutsideOffset;
  const markerR = cellSize * 0.38;

  // ── Solution polyline ────────────────────────────────────────────────────────
  const solutionPoints = showSolution && solution.length > 0
    ? solution.map((idx) => {
        const { x, y } = indexToPoint(idx, width);
        return `${padding + x * cellSize + cellSize / 2},${padding + y * cellSize + cellSize / 2}`;
      }).join(' ')
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
  const playerCx = playerPosition
    ? padding + playerPosition.x * cellSize + cellSize / 2
    : null;
  const playerCy = playerPosition
    ? padding + playerPosition.y * cellSize + cellSize / 2
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
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
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

      {/* Entry marker — green play triangle */}
      <circle cx={entryCx} cy={entryCy} r={markerR} fill="#22c55e" opacity={0.9} />
      {cellSize >= 14 && (
        <polygon
          points={`${entryCx - markerR * 0.35},${entryCy - markerR * 0.6} ${entryCx + markerR * 0.55},${entryCy} ${entryCx - markerR * 0.35},${entryCy + markerR * 0.6}`}
          fill="white"
          opacity={0.95}
        />
      )}

      {/* Exit marker — amber star / flag */}
      <circle cx={exitCx} cy={exitCy} r={markerR} fill="#f59e0b" opacity={0.9} />
      {cellSize >= 14 && (
        <text
          x={exitCx}
          y={exitCy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={markerR * 1.1}
          aria-hidden="true"
        >★</text>
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
