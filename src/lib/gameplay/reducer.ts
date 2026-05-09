import type { MazeData } from '../../types/maze';
import { pointToIndex } from '../maze/utils';
import { canMove, applyMove, computeRun, getEntryStartPosition, getExitEndPosition, isEntryStep, isExitStep } from './movement';
import type { GameState, GameAction } from './types';

function updateHintCells(hintCells: number[], visitedIndices: number[]): number[] {
  if (hintCells.length === 0) return hintCells;
  let remaining = hintCells;
  for (const idx of visitedIndices) {
    if (remaining.length === 0) break;
    if (idx === remaining[0]) {
      remaining = remaining.slice(1);
    } else {
      return [];
    }
  }
  return remaining;
}

export function createInitialState(maze: MazeData): GameState {
  return {
    status: 'idle',
    playerPosition: getEntryStartPosition(maze),
    trail: [],
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

      // Player steps from the green start marker into the maze.
      if (isEntryStep(maze, state.playerPosition, action.direction)) {
        const newIdx = pointToIndex(maze.entry, maze.width);
        return {
          ...state,
          status: 'playing',
          playerPosition: { ...maze.entry },
          trail: [...state.trail, newIdx],
          hintCells: updateHintCells(state.hintCells, [newIdx]),
          startTime: state.startTime ?? now,
          elapsedMs: state.startTime ? now - state.startTime : 0,
        };
      }

      // Player steps through the exit gap onto the flag → solve.
      if (isExitStep(maze, state.playerPosition, action.direction)) {
        return {
          ...state,
          status: 'solved',
          playerPosition: getExitEndPosition(maze),
          hintCells: [],
          startTime: state.startTime ?? now,
          elapsedMs: state.startTime ? now - state.startTime : 0,
        };
      }

      if (!canMove(maze, state.playerPosition, action.direction)) return state;

      const newPos = applyMove(state.playerPosition, action.direction);
      const newIdx = pointToIndex(newPos, maze.width);

      return {
        ...state,
        status: 'playing',
        playerPosition: newPos,
        trail: [...state.trail, newIdx],
        hintCells: updateHintCells(state.hintCells, [newIdx]),
        startTime: state.startTime ?? now,
        elapsedMs: state.startTime ? now - state.startTime : 0,
      };
    }

    case 'RUN': {
      if (state.status === 'solved' || state.status === 'paused') return state;

      const now = Date.now();

      // Player swipes/d-pads through the exit gap onto the flag → solve.
      if (isExitStep(maze, state.playerPosition, action.direction)) {
        return {
          ...state,
          status: 'solved',
          playerPosition: getExitEndPosition(maze),
          hintCells: [],
          startTime: state.startTime ?? now,
          elapsedMs: state.startTime ? now - state.startTime : 0,
        };
      }

      const path = computeRun(maze, state.playerPosition, action.direction);
      if (path.length === 0) return state;

      const finalPos = path[path.length - 1];
      const newIndices = path.map(p => pointToIndex(p, maze.width));

      return {
        ...state,
        status: 'playing',
        playerPosition: finalPos,
        trail: [...state.trail, ...newIndices],
        hintCells: updateHintCells(state.hintCells, newIndices),
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
      return {
        ...state,
        hintsUsed: action.cells.length > 0 ? state.hintsUsed + 1 : state.hintsUsed,
        hintCells: action.cells,
      };

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
