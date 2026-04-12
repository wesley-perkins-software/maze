import type { Point } from '../../types/maze.js';

export type GameStatus = 'idle' | 'playing' | 'solved';

export type GameState = {
  status: GameStatus;
  playerPosition: Point;
  trail: number[];          // flat cell indices visited, in order
  startTime: number | null; // Date.now() when first move made
  elapsedMs: number;        // total elapsed milliseconds
  solutionVisible: boolean;
};

export type Direction = 'N' | 'E' | 'S' | 'W';

export type GameAction =
  | { type: 'MOVE'; direction: Direction }
  | { type: 'RUN'; direction: Direction }
  | { type: 'SHOW_SOLUTION' }
  | { type: 'HIDE_SOLUTION' }
  | { type: 'TOGGLE_SOLUTION' }
  | { type: 'RESET'; startPosition: Point }
  | { type: 'TICK'; elapsedMs: number };
