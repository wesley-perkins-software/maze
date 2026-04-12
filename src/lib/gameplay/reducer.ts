import type { MazeData } from '../../types/maze';
import { pointToIndex } from '../maze/utils';
import { canMove, applyMove, computeRun } from './movement';
import type { GameState, GameAction } from './types';

export function createInitialState(maze: MazeData): GameState {
  return {
    status: 'idle',
    playerPosition: { ...maze.entry },
    trail: [pointToIndex(maze.entry, maze.width)],
    startTime: null,
    elapsedMs: 0,
    solutionVisible: false,
  };
}

export function gameReducer(
  state: GameState,
  action: GameAction,
  maze: MazeData,
): GameState {
  switch (action.type) {
    case 'MOVE': {
      if (state.status === 'solved') return state;

      if (!canMove(maze, state.playerPosition, action.direction)) return state;

      const newPos = applyMove(state.playerPosition, action.direction);
      const newIdx = pointToIndex(newPos, maze.width);
      const isSolved = newPos.x === maze.exit.x && newPos.y === maze.exit.y;
      const now = Date.now();

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
      if (state.status === 'solved') return state;

      const path = computeRun(maze, state.playerPosition, action.direction);
      if (path.length === 0) return state;

      const finalPos = path[path.length - 1];
      const newIndices = path.map(p => pointToIndex(p, maze.width));
      const isSolved = finalPos.x === maze.exit.x && finalPos.y === maze.exit.y;
      const now = Date.now();

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
