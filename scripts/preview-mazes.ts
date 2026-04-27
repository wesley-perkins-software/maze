import { writeFileSync, mkdirSync } from 'fs';
import { generateMaze } from '../src/lib/maze/generator';
import type { MazeData } from '../src/types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../src/types/maze';

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
  <circle cx="${entryCx}" cy="${entryCy}" r="${r}" fill="#22c55e" opacity="0.9"/>
  <circle cx="${exitCx}"  cy="${exitCy}"  r="${r}" fill="#f59e0b" opacity="0.9"/>
</svg>`;
}

const out = '/home/user/maze/scripts/previews';
mkdirSync(out, { recursive: true });

const samples: Array<{ difficulty: 'small' | 'medium' | 'large'; width: number; height: number; seeds: number[] }> = [
  { difficulty: 'small',  width: 20, height: 20, seeds: [1, 42, 99] },
  { difficulty: 'medium', width: 40, height: 40, seeds: [1, 42, 99] },
  { difficulty: 'large',  width: 60, height: 60, seeds: [1, 42, 99] },
];

for (const { difficulty, width, height, seeds } of samples) {
  for (const seed of seeds) {
    const maze = generateMaze({ difficulty, width, height, seed });
    const cellSize = difficulty === 'small' ? 20 : difficulty === 'medium' ? 12 : 8;
    const svg = renderSVG(maze, cellSize);
    const file = `${out}/${difficulty}-${seed}.svg`;
    writeFileSync(file, svg);
    console.log(`wrote ${file}  (windiness ${(maze.solution.length / Math.max(1, Math.abs(maze.exit.x - maze.entry.x) + Math.abs(maze.exit.y - maze.entry.y))).toFixed(2)})`);
  }
}
