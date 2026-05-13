import type { MazeData, Point } from '../../types/maze';
import { inBounds, pointToIndex } from '../maze/utils';
import { canMove, applyMove, computeRun, computeTapPath, getEntryDirection, getEntryStartPosition, getExitEndPosition, isEntryStep, isExitStep } from './movement';
import type { GameState, GameAction, Direction } from './types';

function inMazeIndex(position: GameState['playerPosition'], maze: MazeData): number | null {
  return inBounds(position, maze.width, maze.height) ? pointToIndex(position, maze.width) : null;
}

function updateHintCells(
  hintCells: number[],
  currentIndex: number | null,
  visitedIndices: number[],
): number[] {
  if (hintCells.length === 0 || visitedIndices.length === 0) return hintCells;

  // A hint is a followable route segment. Keep it active only while the
  // player's movement advances through the segment in order. The full segment
  // remains visible until it is completed or the player deviates from it.
  let progressIndex = currentIndex === null ? -1 : hintCells.indexOf(currentIndex);

  for (const visitedIndex of visitedIndices) {
    const nextExpectedIndex = progressIndex + 1;

    if (hintCells[nextExpectedIndex] !== visitedIndex) {
      return [];
    }

    progressIndex = nextExpectedIndex;

    if (progressIndex === hintCells.length - 1) {
      return [];
    }
  }

  return hintCells;
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

      // Player steps from the start marker into the maze.
      if (isEntryStep(maze, state.playerPosition, action.direction)) {
        const newIdx = pointToIndex(maze.entry, maze.width);
        return {
          ...state,
          status: 'playing',
          playerPosition: { ...maze.entry },
          trail: [...state.trail, newIdx],
          hintCells: updateHintCells(
            state.hintCells,
            inMazeIndex(state.playerPosition, maze),
            [newIdx],
          ),
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
          solutionVisible: false,
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
        hintCells: updateHintCells(
          state.hintCells,
          inMazeIndex(state.playerPosition, maze),
          [newIdx],
        ),
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
          solutionVisible: false,
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
        hintCells: updateHintCells(
          state.hintCells,
          inMazeIndex(state.playerPosition, maze),
          newIndices,
        ),
        startTime: state.startTime ?? now,
        elapsedMs: state.startTime ? now - state.startTime : 0,
      };
    }

    case 'TAP_MOVE': {
      if (state.status === 'solved' || state.status === 'paused') return state;

      const now = Date.now();

      // Player is at the entry start marker — enter the maze regardless of target
      if (!inBounds(state.playerPosition, maze.width, maze.height)) {
        const entryDir = getEntryDirection(maze);
        if (!isEntryStep(maze, state.playerPosition, entryDir)) return state;
        const entryPath = computeRun(maze, state.playerPosition, entryDir);
        if (entryPath.length === 0) return state;
        const finalEntryPos = entryPath[entryPath.length - 1];
        const entryIndices = entryPath.map(p => pointToIndex(p, maze.width));
        return {
          ...state,
          status: 'playing',
          playerPosition: finalEntryPos,
          trail: [...state.trail, ...entryIndices],
          hintCells: updateHintCells(state.hintCells, inMazeIndex(state.playerPosition, maze), entryIndices),
          startTime: state.startTime ?? now,
          elapsedMs: state.startTime ? now - state.startTime : 0,
        };
      }

      const tapResult = computeTapPath(maze, state.playerPosition, action.target);

      let path: Point[];
      if (tapResult === null) {
        // Diagonal tap — run in the dominant axis direction
        const dx = action.target.x - state.playerPosition.x;
        const dy = action.target.y - state.playerPosition.y;
        const dir: Direction = Math.abs(dx) >= Math.abs(dy)
          ? (dx > 0 ? 'E' : 'W')
          : (dy > 0 ? 'S' : 'N');
        path = computeRun(maze, state.playerPosition, dir);
      } else {
        path = tapResult;
      }

      if (path.length === 0) return state;

      const finalPos = path[path.length - 1];
      const newIndices = path.map(p => pointToIndex(p, maze.width));

      return {
        ...state,
        status: 'playing',
        playerPosition: finalPos,
        trail: [...state.trail, ...newIndices],
        hintCells: updateHintCells(state.hintCells, inMazeIndex(state.playerPosition, maze), newIndices),
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

    case 'USE_HINT': {
      const hasHint = action.cells.length > 0;
      return {
        ...state,
        solutionVisible: hasHint ? false : state.solutionVisible,
        hintsUsed: hasHint ? state.hintsUsed + 1 : state.hintsUsed,
        hintCells: action.cells,
      };
    }

    case 'SHOW_SOLUTION':
      return { ...state, solutionVisible: true, hintCells: [] };

    case 'HIDE_SOLUTION':
      return { ...state, solutionVisible: false };

    case 'TOGGLE_SOLUTION':
      return {
        ...state,
        solutionVisible: !state.solutionVisible,
        hintCells: state.solutionVisible ? state.hintCells : [],
      };

    case 'RESET':
      return createInitialState(maze);

    default:
      return state;
  }
}
