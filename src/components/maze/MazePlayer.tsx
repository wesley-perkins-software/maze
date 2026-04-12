/**
 * MazePlayer — Interactive gameplay island.
 * Wraps MazeRenderer with full game state, keyboard/touch input,
 * timer, solution toggle, and solved modal.
 *
 * Maze data is passed as props from Astro at build time — no runtime fetch.
 */
import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { MazeData } from '../../types/maze';
import { MazeRenderer } from './MazeRenderer';
import { Timer } from './Timer';
import { gameReducer, createInitialState } from '../../lib/gameplay/reducer';
import { useKeyboardInput, useTouchInput } from '../../lib/gameplay/input';
import { DPad } from './DPad';

export interface MazePlayerProps {
  maze: MazeData;
}

export function MazePlayer({ maze }: MazePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  const [state, rawDispatch] = useReducer(
    (s: ReturnType<typeof createInitialState>, a: Parameters<typeof gameReducer>[1]) =>
      gameReducer(s, a, maze),
    maze,
    createInitialState,
  );

  const dispatch = rawDispatch;

  // ── Timer tick ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status !== 'playing' || state.startTime === null) return;
    const interval = setInterval(() => {
      dispatch({ type: 'TICK', elapsedMs: Date.now() - state.startTime! });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.status, state.startTime]);

  // ── Announce completion ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'solved' && announcerRef.current) {
      const secs = Math.floor(state.elapsedMs / 1000);
      announcerRef.current.textContent = `Maze solved in ${secs} seconds!`;
    }
  }, [state.status]);

  // ── Input handlers ───────────────────────────────────────────────────────────
  const isActive = state.status !== 'solved';
  useKeyboardInput(dispatch, isActive);
  useTouchInput(svgRef, dispatch, isActive);

  // Determine cell size based on maze dimensions
  const cellSize = Math.max(16, Math.min(32, Math.floor(480 / Math.max(maze.width, maze.height))));

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Screen reader announcer */}
      <div
        ref={announcerRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Controls bar */}
      <div className="flex items-center justify-between w-full max-w-lg gap-3 px-1">
        <div className="flex items-center gap-3">
          {/* Status */}
          {state.status === 'idle' && (
            <span className="text-sm text-slate-500">Use arrow keys, swipe, or tap controls to start</span>
          )}
          {state.status === 'playing' && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                <polyline points="12 6 12 12 16 14" strokeWidth="2"/>
              </svg>
              <Timer elapsedMs={state.elapsedMs} />
            </div>
          )}
          {state.status === 'solved' && (
            <span className="text-sm font-semibold text-green-600">
              ✓ Solved in {Math.floor(state.elapsedMs / 1000)}s!
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Solution toggle */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SOLUTION' })}
            className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
              state.solutionVisible
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
            aria-pressed={state.solutionVisible}
          >
            {state.solutionVisible ? 'Hide Solution' : 'Show Solution'}
          </button>

          {/* Reset */}
          <button
            onClick={() => dispatch({ type: 'RESET', startPosition: maze.entry })}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-medium transition-colors"
            aria-label="Reset maze"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Maze SVG */}
      <div
        className="relative rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden touch-none"
        style={{ maxWidth: '100%' }}
      >
        <MazeRenderer
          maze={maze}
          cellSize={cellSize}
          playerPosition={state.playerPosition}
          trail={state.trail}
          solution={maze.solution}
          showSolution={state.solutionVisible}
          interactive={isActive}
          svgRef={svgRef}
        />

        {/* Solved overlay */}
        {state.status === 'solved' && (
          <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3 rounded-xl">
            <div className="text-4xl" aria-hidden="true">🎉</div>
            <h3 className="text-xl font-bold text-slate-800">Maze Solved!</h3>
            <p className="text-slate-600 text-sm">
              Time: {Math.floor(state.elapsedMs / 1000)} seconds
              {state.trail.length > 0 && ` · ${state.trail.length} steps`}
            </p>
            <button
              onClick={() => dispatch({ type: 'RESET', startPosition: maze.entry })}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              autoFocus
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* D-pad (mobile only) */}
      <DPad dispatch={dispatch} isActive={isActive} />

      {/* Mobile hint */}
      <p className="text-xs text-slate-400 text-center md:hidden" aria-hidden="true">
        Tap controls or swipe to move
      </p>
      <p className="text-xs text-slate-400 text-center hidden md:block" aria-hidden="true">
        Arrow keys or WASD to move
      </p>
    </div>
  );
}
