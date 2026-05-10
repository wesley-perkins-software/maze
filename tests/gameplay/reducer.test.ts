import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { gameReducer, createInitialState } from '../../src/lib/gameplay/reducer';
import type { Point } from '../../src/types/maze';
import type { Direction, GameState } from '../../src/lib/gameplay/types';
import { applyMove, canMove, getEntryDirection, getEntryStartPosition, getExitDirection, getExitEndPosition } from '../../src/lib/gameplay/movement';

function makeMaze() {
  return generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 42 });
}

function perimeterDir(pt: Point, width: number, height: number): Direction {
  if (pt.y === 0)          return 'N';
  if (pt.y === height - 1) return 'S';
  if (pt.x === 0)          return 'W';
  return 'E';
}

const DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W'];

function pointToIndex(point: Point, width: number): number {
  return point.y * width + point.x;
}

function indexToPoint(index: number, width: number): Point {
  return { x: index % width, y: Math.floor(index / width) };
}

function directionBetween(from: Point, to: Point): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
}

function findDeviationFromSolution(maze: ReturnType<typeof makeMaze>) {
  for (let i = 0; i < maze.solution.length - 1; i++) {
    const current = indexToPoint(maze.solution[i], maze.width);
    const previousIndex = i > 0 ? maze.solution[i - 1] : null;

    for (const direction of DIRECTIONS) {
      if (!canMove(maze, current, direction)) continue;

      const candidate = applyMove(current, direction);
      const candidateIndex = pointToIndex(candidate, maze.width);
      if (candidateIndex !== maze.solution[i + 1] && candidateIndex !== previousIndex) {
        return { solutionIndex: i, direction };
      }
    }
  }

  throw new Error('Expected generated maze to include a deviation from the solution path');
}

describe('gameReducer', () => {
  it('starts in idle state on the entry marker', () => {
    const maze = makeMaze();
    const state = createInitialState(maze);
    expect(state.status).toBe('idle');
    expect(state.playerPosition).toEqual(getEntryStartPosition(maze));
    expect(state.trail).toEqual([]);
    expect(state.solutionVisible).toBe(false);
  });

  it('transitions to playing when moving from the entry marker into the maze', () => {
    const maze = makeMaze();
    let state = createInitialState(maze);
    state = gameReducer(state, { type: 'MOVE', direction: getEntryDirection(maze) }, maze);
    expect(state.status).toBe('playing');
    expect(state.playerPosition).toEqual(maze.entry);
    expect(state.trail).toEqual([maze.entry.y * maze.width + maze.entry.x]);
    expect(state.startTime).not.toBeNull();
  });

  it('ignores moves that exit the grid through the perimeter gap', () => {
    const maze = makeMaze();
    const state: GameState = {
      ...createInitialState(maze),
      status: 'playing',
      playerPosition: { ...maze.entry },
      trail: [maze.entry.y * maze.width + maze.entry.x],
    };
    // Moving in the perimeter-exit direction from entry leads out of bounds — always blocked.
    const dir = perimeterDir(maze.entry, maze.width, maze.height);
    const newState = gameReducer(state, { type: 'MOVE', direction: dir }, maze);
    expect(newState).toBe(state); // same reference — no state change
  });

  it('solves the maze by following the solution path', () => {
    const maze = makeMaze();
    let state = gameReducer(createInitialState(maze), { type: 'MOVE', direction: getEntryDirection(maze) }, maze);
    const solution = maze.solution;

    for (let i = 0; i < solution.length - 1; i++) {
      const from = { x: solution[i] % maze.width, y: Math.floor(solution[i] / maze.width) };
      const to   = { x: solution[i+1] % maze.width, y: Math.floor(solution[i+1] / maze.width) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
      state = gameReducer(state, { type: 'MOVE', direction: dir as any }, maze);
    }

    expect(state.status).toBe('playing');
    expect(state.playerPosition).toEqual(maze.exit);

    state = gameReducer(state, { type: 'MOVE', direction: getExitDirection(maze) }, maze);
    expect(state.status).toBe('solved');
    expect(state.playerPosition).toEqual(getExitEndPosition(maze));
  });

  it('does not solve on a run that only reaches the exit cell', () => {
    const maze = makeMaze();
    const solution = maze.solution;
    const exitIdx = solution[solution.length - 1];
    const beforeExitIdx = solution[solution.length - 2];
    const beforeExit = { x: beforeExitIdx % maze.width, y: Math.floor(beforeExitIdx / maze.width) };
    const exitCell = { x: exitIdx % maze.width, y: Math.floor(exitIdx / maze.width) };
    const dx = exitCell.x - beforeExit.x;
    const dy = exitCell.y - beforeExit.y;
    const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';

    let state: GameState = {
      ...createInitialState(maze),
      status: 'playing',
      playerPosition: beforeExit,
      trail: [beforeExitIdx],
    };

    state = gameReducer(state, { type: 'RUN', direction: dir as Direction }, maze);
    expect(state.status).toBe('playing');
    expect(state.playerPosition).toEqual(maze.exit);

    state = gameReducer(state, { type: 'RUN', direction: getExitDirection(maze) }, maze);
    expect(state.status).toBe('solved');
    expect(state.playerPosition).toEqual(getExitEndPosition(maze));
  });

  it('toggles solution visibility', () => {
    const maze = makeMaze();
    let state = createInitialState(maze);
    expect(state.solutionVisible).toBe(false);
    state = gameReducer(state, { type: 'TOGGLE_SOLUTION' }, maze);
    expect(state.solutionVisible).toBe(true);
    state = gameReducer(state, { type: 'TOGGLE_SOLUTION' }, maze);
    expect(state.solutionVisible).toBe(false);
  });

  it('keeps hints visible while the player follows the hinted path', () => {
    const maze = makeMaze();
    const hintCells = maze.solution.slice(0, 4);
    let state: GameState = {
      ...createInitialState(maze),
      status: 'playing',
      playerPosition: { ...maze.entry },
      trail: [pointToIndex(maze.entry, maze.width)],
      hintCells,
    };

    const next = indexToPoint(maze.solution[1], maze.width);
    state = gameReducer(state, { type: 'MOVE', direction: directionBetween(maze.entry, next) }, maze);

    expect(state.hintCells).toEqual(hintCells);
  });

  it('clears hints when the hinted segment is completed', () => {
    const maze = makeMaze();
    const hintCells = maze.solution.slice(0, 4);
    let state: GameState = {
      ...createInitialState(maze),
      status: 'playing',
      playerPosition: { ...maze.entry },
      trail: [pointToIndex(maze.entry, maze.width)],
      hintCells,
    };

    for (let i = 0; i < hintCells.length - 1; i++) {
      state = gameReducer(state, {
        type: 'MOVE',
        direction: directionBetween(indexToPoint(hintCells[i], maze.width), indexToPoint(hintCells[i + 1], maze.width)),
      }, maze);
    }

    expect(state.hintCells).toEqual([]);
  });

  it('clears hints when the player leaves the hinted path', () => {
    const maze = makeMaze();
    const deviation = findDeviationFromSolution(maze);
    const currentIndex = maze.solution[deviation.solutionIndex];
    let state: GameState = {
      ...createInitialState(maze),
      status: 'playing',
      playerPosition: indexToPoint(currentIndex, maze.width),
      trail: maze.solution.slice(0, deviation.solutionIndex + 1),
      hintCells: maze.solution.slice(deviation.solutionIndex, deviation.solutionIndex + 4),
    };

    state = gameReducer(state, { type: 'MOVE', direction: deviation.direction }, maze);

    expect(state.hintCells).toEqual([]);
  });

  it('clears hints when solution is shown', () => {
    const maze = makeMaze();
    let state: GameState = {
      ...createInitialState(maze),
      hintCells: maze.solution.slice(0, 4),
    };

    state = gameReducer(state, { type: 'TOGGLE_SOLUTION' }, maze);
    expect(state.solutionVisible).toBe(true);
    expect(state.hintCells).toEqual([]);
  });

  it('turns off solution when a hint is shown', () => {
    const maze = makeMaze();
    let state: GameState = {
      ...createInitialState(maze),
      solutionVisible: true,
    };
    const hintCells = maze.solution.slice(0, 4);

    state = gameReducer(state, { type: 'USE_HINT', cells: hintCells }, maze);
    expect(state.solutionVisible).toBe(false);
    expect(state.hintCells).toEqual(hintCells);
    expect(state.hintsUsed).toBe(1);
  });

  it('resets state', () => {
    const maze = makeMaze();
    let state = createInitialState(maze);
    state = { ...state, status: 'playing', elapsedMs: 5000 };
    state = gameReducer(state, { type: 'RESET', startPosition: maze.entry }, maze);
    expect(state.status).toBe('idle');
    expect(state.elapsedMs).toBe(0);
  });
});
