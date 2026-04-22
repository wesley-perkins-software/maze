import type { MazeData } from '../../types/maze';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../../types/maze';
import { pointToIndex } from '../maze/utils';
import { canMove, applyMove, computeRun } from './movement';
import type { GameState, GameAction } from './types';

const DIR_DELTA = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
} as const;

const DIR_WALL = {
  N: WALL_N,
  E: WALL_E,
  S: WALL_S,
  W: WALL_W,
} as const;

function isExitMoveOutOfMaze(state: GameState, action: GameAction, maze: MazeData): boolean {
  if (action.type !== 'MOVE' && action.type !== 'RUN') return false;
  if (state.playerPosition.x !== maze.exit.x || state.playerPosition.y !== maze.exit.y) return false;

  const { dx, dy } = DIR_DELTA[action.direction];
  const destX = state.playerPosition.x + dx;
  const destY = state.playerPosition.y + dy;
  const exitsBounds = destX < 0 || destY < 0 || destX >= maze.width || destY >= maze.height;
  if (!exitsBounds) return false;

  const idx = pointToIndex(state.playerPosition, maze.width);
  const cell = maze.grid[idx];
  return !(cell & DIR_WALL[action.direction]);
}

export function createInitialState(maze: MazeData): GameState {
  return {
    status: 'idle',
    playerPosition: { ...maze.entry },
    trail: [pointToIndex(maze.entry, maze.width)],
    startTime: null,
    elapsedMs: 0,
    solutionVisible: false,
    hintsUsed: 0,
    hintCells: [],
  };
}

export function gameReducer(
  state: GameState,
  action: GameAction,
  maze: MazeData,
): GameState {
  switch (action.type) {
    case 'MOVE': {
      if (state.status === 'solved' || state.status === 'paused') return state;
      const now = Date.now();

      if (isExitMoveOutOfMaze(state, action, maze)) {
        return {
          ...state,
          status: 'solved',
          startTime: state.startTime ?? now,
          elapsedMs: state.startTime ? now - state.startTime : 0,
        };
      }

      if (!canMove(maze, state.playerPosition, action.direction)) return state;

      const newPos = applyMove(state.playerPosition, action.direction);
      const newIdx = pointToIndex(newPos, maze.width);
      const isSolved = newPos.x === maze.exit.x && newPos.y === maze.exit.y;

      return {
        ...state,
        status: isSolved ? 'solved' : 'playing',
        playerPosition: newPos,
        trail: [...state.trail, newIdx],
        startTime: state.startTime ?? now,
        elapsedMs: state.startTime ? now - state.startTime : 0,
      };
    }

    case 'RUN': {
      if (state.status === 'solved' || state.status === 'paused') return state;
      const now = Date.now();

      if (isExitMoveOutOfMaze(state, action, maze)) {
        return {
          ...state,
          status: 'solved',
          startTime: state.startTime ?? now,
          elapsedMs: state.startTime ? now - state.startTime : 0,
        };
      }

      const path = computeRun(maze, state.playerPosition, action.direction);
      if (path.length === 0) return state;

      const finalPos = path[path.length - 1];
      const newIndices = path.map(p => pointToIndex(p, maze.width));
      const isSolved = finalPos.x === maze.exit.x && finalPos.y === maze.exit.y;

      return {
        ...state,
        status: isSolved ? 'solved' : 'playing',
        playerPosition: finalPos,
        trail: [...state.trail, ...newIndices],
        startTime: state.startTime ?? now,
        elapsedMs: state.startTime ? now - state.startTime : 0,
      };
    }

    case 'TICK': {
      if (state.status !== 'playing' || state.startTime === null) return state;
      return { ...state, elapsedMs: action.elapsedMs };
    }

    case 'PAUSE': {
      if (state.status !== 'playing') return state;
      return { ...state, status: 'paused' };
    }

    case 'RESUME': {
      if (state.status !== 'paused') return state;
      // Shift startTime so elapsed time doesn't jump when resuming
      const newStart = Date.now() - state.elapsedMs;
      return { ...state, status: 'playing', startTime: newStart };
    }

    case 'USE_HINT':
      return { ...state, hintsUsed: state.hintsUsed + 1, hintCells: action.cells };

    case 'SHOW_SOLUTION':
      return { ...state, solutionVisible: true };

    case 'HIDE_SOLUTION':
      return { ...state, solutionVisible: false };

    case 'TOGGLE_SOLUTION':
      return { ...state, solutionVisible: !state.solutionVisible };

    case 'RESET':
      return createInitialState(maze);

    default:
      return state;
  }
}
