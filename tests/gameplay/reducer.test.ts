import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { gameReducer, createInitialState } from '../../src/lib/gameplay/reducer';
import type { Point } from '../../src/types/maze';
import type { Direction, GameState } from '../../src/lib/gameplay/types';
import { getEntryDirection, getEntryStartPosition, getExitDirection, getExitEndPosition } from '../../src/lib/gameplay/movement';

function makeMaze() {
  return generateMaze({ width: 8, height: 8, difficulty: 'large', seed: 42 });
}

function perimeterDir(pt: Point, width: number, height: number): Direction {
  if (pt.y === 0)          return 'N';
  if (pt.y === height - 1) return 'S';
  if (pt.x === 0)          return 'W';
  return 'E';
}

describe('gameReducer', () => {
  it('starts in idle state on the green entry marker', () => {
    const maze = makeMaze();
    const state = createInitialState(maze);
    expect(state.status).toBe('idle');
    expect(state.playerPosition).toEqual(getEntryStartPosition(maze));
    expect(state.trail).toEqual([]);
    expect(state.solutionVisible).toBe(false);
  });

  it('transitions to playing when moving from the green marker into the maze', () => {
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

  it('clears hints after successful movement', () => {
    const maze = makeMaze();
    let state: GameState = {
      ...createInitialState(maze),
      status: 'playing',
      playerPosition: { ...maze.entry },
      trail: [maze.entry.y * maze.width + maze.entry.x],
      hintCells: maze.solution.slice(0, 4),
    };

    const nextIdx = maze.solution[1];
    const next = { x: nextIdx % maze.width, y: Math.floor(nextIdx / maze.width) };
    const dx = next.x - maze.entry.x;
    const dy = next.y - maze.entry.y;
    const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';

    state = gameReducer(state, { type: 'MOVE', direction: dir as Direction }, maze);
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

  it('does not add hints while solution is visible', () => {
    const maze = makeMaze();
    let state: GameState = {
      ...createInitialState(maze),
      solutionVisible: true,
    };

    state = gameReducer(state, { type: 'USE_HINT', cells: maze.solution.slice(0, 4) }, maze);
    expect(state.solutionVisible).toBe(true);
    expect(state.hintCells).toEqual([]);
    expect(state.hintsUsed).toBe(0);
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
