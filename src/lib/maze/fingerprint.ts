import type { MazeData } from '../../types/maze';

function fnv1aHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

export function getMazeWallHash(maze: MazeData): string {
  return fnv1aHash(maze.grid.join(','));
}

export function getMazeDebugSummary(maze: MazeData) {
  return {
    width: maze.width,
    height: maze.height,
    seed: maze.seed,
    entry: maze.entry,
    exit: maze.exit,
    hash: getMazeWallHash(maze),
  };
}

export function shouldLogMazeStateDebug(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem('maze:state-debug') === '1';
  } catch {
    return false;
  }
}
