import { describe, it, expect } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { canMove, applyMove } from '../../src/lib/gameplay/movement';

describe('canMove', () => {
  it('returns false when wall is present', () => {
    // A hard maze with no extra walls — entry is top-left
    const maze = generateMaze({ width: 5, height: 5, difficulty: 'hard', seed: 1 });
    // The top-left corner always has North and West walls (border)
    const entry = maze.entry; // {x:0, y:0}
    expect(canMove(maze, entry, 'W')).toBe(false); // border West wall
  });

  it('returns true when passage exists', () => {
    const maze = generateMaze({ width: 5, height: 5, difficulty: 'hard', seed: 1 });
    // Follow the solution path — each step should be a valid move
    const solution = maze.solution;
    for (let i = 0; i < solution.length - 1; i++) {
      const from = { x: solution[i] % maze.width, y: Math.floor(solution[i] / maze.width) };
      const to   = { x: solution[i+1] % maze.width, y: Math.floor(solution[i+1] / maze.width) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
      expect(canMove(maze, from, dir as any)).toBe(true);
    }
  });
});

describe('applyMove', () => {
  it('moves N correctly', () => expect(applyMove({x:2,y:3},'N')).toEqual({x:2,y:2}));
  it('moves E correctly', () => expect(applyMove({x:2,y:3},'E')).toEqual({x:3,y:3}));
  it('moves S correctly', () => expect(applyMove({x:2,y:3},'S')).toEqual({x:2,y:4}));
  it('moves W correctly', () => expect(applyMove({x:2,y:3},'W')).toEqual({x:1,y:3}));
});
