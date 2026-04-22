import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { gameReducer, createInitialState } from '../../src/lib/gameplay/reducer';
import type { MazeData } from '../../src/types/maze';

function makeMaze() {
  return generateMaze({ width: 5, height: 5, difficulty: 'hard', seed: 42 });
}

describe('gameReducer', () => {
  it('starts in idle state at entry', () => {
    const maze = makeMaze();
    const state = createInitialState(maze);
    expect(state.status).toBe('idle');
    expect(state.playerPosition).toEqual(maze.entry);
    expect(state.solutionVisible).toBe(false);
  });

  it('transitions to playing on first valid move', () => {
    const maze = makeMaze();
    let state = createInitialState(maze);
    // Follow the first step of the solution
    const solution = maze.solution;
    const from = maze.entry;
    const to = { x: solution[1] % maze.width, y: Math.floor(solution[1] / maze.width) };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
    state = gameReducer(state, { type: 'MOVE', direction: dir as any }, maze);
    expect(state.status).toBe('playing');
    expect(state.playerPosition).toEqual(to);
    expect(state.startTime).not.toBeNull();
  });

  it('ignores moves into walls', () => {
    const maze = makeMaze();
    const state = createInitialState(maze);
    // West wall always present at entry (0,0) border
    const newState = gameReducer(state, { type: 'MOVE', direction: 'W' }, maze);
    expect(newState).toBe(state); // same reference (no change)
  });

  it('solves the maze by following the solution path', () => {
    const maze = makeMaze();
    let state = createInitialState(maze);
    const solution = maze.solution;

    for (let i = 0; i < solution.length - 1; i++) {
      const from = { x: solution[i] % maze.width, y: Math.floor(solution[i] / maze.width) };
      const to   = { x: solution[i+1] % maze.width, y: Math.floor(solution[i+1] / maze.width) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
      state = gameReducer(state, { type: 'MOVE', direction: dir as any }, maze);
    }

    // Solve by exiting through the open boundary from the exit cell.
    state = gameReducer(state, { type: 'MOVE', direction: 'S' }, maze);

    expect(state.status).toBe('solved');
    expect(state.playerPosition).toEqual(maze.exit);
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

  it('resets state', () => {
    const maze = makeMaze();
    let state = createInitialState(maze);
    state = { ...state, status: 'playing', elapsedMs: 5000 };
    state = gameReducer(state, { type: 'RESET', startPosition: maze.entry }, maze);
    expect(state.status).toBe('idle');
    expect(state.elapsedMs).toBe(0);
  });

  it('marks solved when moving out of bounds through the open exit', () => {
    const maze: MazeData = {
      id: 'test-run-pass-through-exit',
      slug: 'test-run-pass-through-exit',
      difficulty: 'easy',
      width: 1,
      height: 1,
      seed: 1,
      entry: { x: 0, y: 0 },
      exit: { x: 0, y: 0 },
      // N/E/W walls closed, south open
      grid: [11],
      solution: [0],
      generatedAt: new Date(0).toISOString(),
    };

    const state = createInitialState(maze);
    const next = gameReducer(state, { type: 'RUN', direction: 'S' }, maze);

    expect(next.status).toBe('solved');
    expect(next.playerPosition).toEqual(maze.exit);
    expect(next.trail[next.trail.length - 1]).toBe(0);
  });
});
