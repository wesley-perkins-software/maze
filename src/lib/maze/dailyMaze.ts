import { generateMaze, GENERATOR_VERSION } from './generator';
import type { MazeData } from '../../types/maze';

export function getLocalDateString(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailyMazeSeed(dateStr: string): number {
  const input = `maze-of-the-day:${dateStr}:v${GENERATOR_VERSION}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createDailyMaze(date?: Date): MazeData {
  const today = getLocalDateString(date);
  const seed = dailyMazeSeed(today);
  const maze = generateMaze({ width: 60, height: 60, difficulty: 'large', seed, anyPortalSide: true });
  maze.id = `daily-${today}`;
  maze.slug = `daily-${today}`;
  return maze;
}
