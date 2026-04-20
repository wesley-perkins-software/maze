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

  // ── Entry / exit markers ─────────────────────────────────────────────────────
  const ms = cellSize * 0.4;
  const mOff = (cellSize - ms) / 2;

  // ── Solution polyline ────────────────────────────────────────────────────────
  const solutionPoints = showSolution && solution.length > 0
    ? solution.map((idx) => {
        const { x, y } = indexToPoint(idx, width);
        return `${padding + x * cellSize + cellSize / 2},${padding + y * cellSize + cellSize / 2}`;
      }).join(' ')
    : null;

  // ── Trail polyline ───────────────────────────────────────────────────────────
  const trailPoints = trail.length > 1
    ? trail.map((idx) => {
        const { x, y } = indexToPoint(idx, width);
        return `${padding + x * cellSize + cellSize / 2},${padding + y * cellSize + cellSize / 2}`;
      }).join(' ')
    : null;

  // ── Player circle ────────────────────────────────────────────────────────────
  const playerCx = playerPosition
    ? padding + playerPosition.x * cellSize + cellSize / 2
    : null;
  const playerCy = playerPosition
    ? padding + playerPosition.y * cellSize + cellSize / 2
    : null;

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

      {/* Trail */}
      {trailPoints && (
        <polyline
          points={trailPoints}
          stroke="#93c5fd"
          strokeWidth={cellSize * 0.25}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={1.0}
        />
      )}

      {/* Walls */}
      <path
        d={wallPaths.join(' ')}
        stroke="#1e293b"
        strokeWidth={wallThickness}
        strokeLinecap="square"
        fill="none"
      />

      {/* Entry marker */}
      <rect
        x={padding + entry.x * cellSize + mOff}
        y={padding + entry.y * cellSize + mOff}
        width={ms}
        height={ms}
        rx={ms * 0.2}
        fill="#3b82f6"
        opacity={0.8}
      />

      {/* Exit marker */}
      <rect
        x={padding + exit.x * cellSize + mOff}
        y={padding + exit.y * cellSize + mOff}
        width={ms}
        height={ms}
        rx={ms * 0.2}
        fill="#ef4444"
        opacity={0.8}
      />

      {/* Player */}
      {playerCx !== null && playerCy !== null && (
        <>
          <circle
            cx={playerCx}
            cy={playerCy}
            r={playerMarkerRadius ? playerMarkerRadius * 1.6 : cellSize * 0.45}
            fill="#2563eb"
            opacity={0.2}
          />
          <circle
            cx={playerCx}
            cy={playerCy}
            r={playerMarkerRadius ?? cellSize * 0.32}
            fill="#2563eb"
            stroke="white"
            strokeWidth={playerMarkerRadius ? Math.max(1.5, playerMarkerRadius * 0.35) : 2}
          />
        </>
      )}
    </svg>
  );
}
