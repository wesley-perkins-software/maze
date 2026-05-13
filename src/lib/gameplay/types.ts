import type { Point } from '../../types/maze.js';

export type GameStatus = 'idle' | 'playing' | 'paused' | 'solved';

export type GameState = {
  status: GameStatus;
  playerPosition: Point;
  trail: number[];          // flat cell indices visited, in order
  startTime: number | null; // Date.now() when first move made
  elapsedMs: number;        // total elapsed milliseconds
  solutionVisible: boolean;
  hintsUsed: number;        // number of hints revealed
  hintCells: number[];      // flat cell indices currently highlighted as hint
};

export type Direction = 'N' | 'E' | 'S' | 'W';

export type GameAction =
  | { type: 'MOVE'; direction: Direction }
  | { type: 'RUN'; direction: Direction }
  | { type: 'TAP_MOVE'; target: Point }
  | { type: 'SHOW_SOLUTION' }
  | { type: 'HIDE_SOLUTION' }
  | { type: 'TOGGLE_SOLUTION' }
  | { type: 'RESET'; startPosition: Point }
  | { type: 'TICK'; elapsedMs: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'USE_HINT'; cells: number[] };
