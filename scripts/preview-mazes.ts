import { writeFileSync, mkdirSync } from 'fs';
import { generateMaze } from '../src/lib/maze/generator';
import type { MazeData } from '../src/types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../src/types/maze';
import { FINISH_MARKER_COLOR, START_MARKER_COLOR } from '../src/lib/maze/markerStyles';

function renderSVG(maze: MazeData, cellSize = 10): string {
  const { width, height, grid, entry, exit, solution } = maze;
  const pad = 4;
  const W = width * cellSize + pad * 2;
  const H = height * cellSize + pad * 2;
  const walls: string[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y * width + x];
      const px = pad + x * cellSize;
      const py = pad + y * cellSize;
      if (cell & WALL_N) walls.push(`M${px},${py}L${px + cellSize},${py}`);
      if (cell & WALL_W) walls.push(`M${px},${py}L${px},${py + cellSize}`);
      if (x === width - 1 && (cell & WALL_E))
        walls.push(`M${px + cellSize},${py}L${px + cellSize},${py + cellSize}`);
      if (y === height - 1 && (cell & WALL_S))
        walls.push(`M${px},${py + cellSize}L${px + cellSize},${py + cellSize}`);
    }
  }

  const sol = solution.map(idx => {
    const x = idx % width, y = Math.floor(idx / width);
    return `${pad + x * cellSize + cellSize / 2},${pad + y * cellSize + cellSize / 2}`;
  }).join(' ');

  const entryCx = pad + entry.x * cellSize + cellSize / 2;
  const entryCy = pad + entry.y * cellSize + cellSize / 2;
  const exitCx  = pad + exit.x  * cellSize + cellSize / 2;
  const exitCy  = pad + exit.y  * cellSize + cellSize / 2;
  const r = cellSize * 0.38;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="white"/>
  <polyline points="${sol}" stroke="#ef4444" stroke-width="${cellSize * 0.18}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
  <path d="${walls.join(' ')}" stroke="#1e293b" stroke-width="1.5" stroke-linecap="square" fill="none"/>
  <circle cx="${entryCx}" cy="${entryCy}" r="${r}" fill="white"/>
  <line x1="${entryCx - r * 0.18}" y1="${entryCy + r * 0.52}" x2="${entryCx - r * 0.18}" y2="${entryCy - r * 0.56}" stroke="${START_MARKER_COLOR}" stroke-width="${Math.max(1, r * 0.18)}" stroke-linecap="round"/>
  <polygon points="${entryCx - r * 0.18},${entryCy - r * 0.56} ${entryCx + r * 0.56},${entryCy - r * 0.28} ${entryCx + r * 0.26},${entryCy + r * 0.02} ${entryCx - r * 0.18},${entryCy + r * 0.02}" fill="none" stroke="${START_MARKER_COLOR}" stroke-width="${Math.max(1, r * 0.16)}" stroke-linejoin="round"/>
  <circle cx="${exitCx}" cy="${exitCy}" r="${r}" fill="white"/>
  <circle cx="${exitCx}"  cy="${exitCy}"  r="${r * 0.78}" fill="${FINISH_MARKER_COLOR}" opacity="0.92"/>
  <line x1="${exitCx - r * 0.08}" y1="${exitCy + r * 0.46}" x2="${exitCx - r * 0.08}" y2="${exitCy - r * 0.56}" stroke="white" stroke-width="${Math.max(1, r * 0.16)}" stroke-linecap="round"/>
  <polygon points="${exitCx - r * 0.08},${exitCy - r * 0.56} ${exitCx + r * 0.52},${exitCy - r * 0.26} ${exitCx - r * 0.08},${exitCy + r * 0.05}" fill="white" opacity="0.95"/>
</svg>`;
}

const out = '/home/user/maze/scripts/previews';
mkdirSync(out, { recursive: true });

const testSets = [
  { label: 'A', newestBias: 0.75, braidFactor: 0.01 },
  { label: 'B', newestBias: 0.85, braidFactor: 0.01 },
  { label: 'C', newestBias: 0.80, braidFactor: 0.01 },
];

const seeds = [1, 42];
const width = 60, height = 60, cellSize = 8;

for (const ts of testSets) {
  for (const seed of seeds) {
    const maze = generateMaze({
      difficulty: 'large', width, height, seed,
      newestBias: ts.newestBias,
      braidFactor: ts.braidFactor,
    });
    const svg = renderSVG(maze, cellSize);
    const file = `${out}/set${ts.label}-seed${seed}.svg`;
    writeFileSync(file, svg);
    const manhattan = Math.abs(maze.exit.x - maze.entry.x) + Math.abs(maze.exit.y - maze.entry.y);
    console.log(`set${ts.label} seed=${seed}  windiness=${(maze.solution.length / Math.max(1, manhattan)).toFixed(2)}`);
  }
}
