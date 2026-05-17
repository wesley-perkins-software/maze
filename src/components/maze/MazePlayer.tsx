/**
 * MazePlayer — Interactive gameplay island.
 * Features: keyboard/touch/D-pad input, timer with pause, hint system,
 * personal best tracking (localStorage), solution toggle, solved modal.
 */
import { useReducer, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { MazeData } from '../../types/maze';
import { MazeRenderer } from './MazeRenderer';
import { Timer } from './Timer';
import { gameReducer, createInitialState } from '../../lib/gameplay/reducer';
import { useKeyboardInput, useTouchInput } from '../../lib/gameplay/input';
import { DPad } from './DPad';
import { inBounds } from '../../lib/maze/utils';
import { solveMazeFrom } from '../../lib/maze/solver';
import { PostSolveOverlay } from './PostSolveOverlay';
import type { PostSolveNav } from './PostSolveOverlay';

export type { PostSolveNav };

export interface MazePlayerProps {
  maze: MazeData;
  onSolve?: () => void;
  postSolveNav?: PostSolveNav;
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPathStartCell(maze: MazeData, playerPosition: MazeData['entry']): MazeData['entry'] {
  return inBounds(playerPosition, maze.width, maze.height) ? playerPosition : maze.entry;
}

function getHintStepCount(maze: MazeData): number {
  return clamp(8, Math.round(Math.max(maze.width, maze.height) * 0.4), 20);
}

const PERSONAL_BEST_KEY = (slug: string) => `pb:${slug}`;
const SOLVE_REVEAL_DELAY_MS = 250;

function getPersonalBest(slug: string): number | null {
  try {
    const raw = localStorage.getItem(PERSONAL_BEST_KEY(slug));
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

function savePersonalBest(slug: string, ms: number) {
  try {
    const prev = getPersonalBest(slug);
    if (prev === null || ms < prev) {
      localStorage.setItem(PERSONAL_BEST_KEY(slug), String(ms));
      return true;
    }
  } catch {/* ignore */}
  return false;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${s}s`;
}

export function MazePlayer({ maze, onSolve, postSolveNav }: MazePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);
  const isNewBestRef = useRef(false);
  const [showSolvedOverlay, setShowSolvedOverlay] = useState(false);

  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof createInitialState>, a: Parameters<typeof gameReducer>[1]) =>
      gameReducer(s, a, maze),
    maze,
    createInitialState,
  );

  // ── Timer tick ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status !== 'playing' || state.startTime === null) return;
    const interval = setInterval(() => {
      dispatch({ type: 'TICK', elapsedMs: Date.now() - state.startTime! });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.status, state.startTime]);

  // ── Personal best / solved overlay ────────────────────────────────────────────
  useEffect(() => {
    if (state.status !== 'solved') {
      setShowSolvedOverlay(false);
      return;
    }

    if (maze.slug) isNewBestRef.current = savePersonalBest(maze.slug, state.elapsedMs);

    const id = window.setTimeout(() => {
      setShowSolvedOverlay(true);
      onSolve?.();
    }, SOLVE_REVEAL_DELAY_MS);

    return () => window.clearTimeout(id);
  }, [state.status]);

  // ── Announce completion ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'solved' && announcerRef.current) {
      const secs = Math.floor(state.elapsedMs / 1000);
      announcerRef.current.textContent = `Maze solved in ${secs} seconds!`;
    }
  }, [state.status]);

  // ── Input handlers ───────────────────────────────────────────────────────────
  const isActive = state.status === 'playing' || state.status === 'idle';
  const cellSize = Math.max(8, Math.min(32, Math.floor(560 / Math.max(maze.width, maze.height))));

  useKeyboardInput(dispatch, isActive);
  useTouchInput(svgRef, dispatch, isActive);

  // ── Trail visibility preference (persisted) ──────────────────────────────────
  const [showTrail, setShowTrail] = useState(() => {
    try { return localStorage.getItem('maze:show-trail') !== 'false'; } catch { return true; }
  });
  const toggleShowTrail = () => {
    setShowTrail(v => {
      const next = !v;
      try { localStorage.setItem('maze:show-trail', next ? 'true' : 'false'); } catch {}
      return next;
    });
  };

  const currentSolution = useMemo(() => {
    const startCell = getPathStartCell(maze, state.playerPosition);
    return solveMazeFrom(maze, startCell);
  }, [maze, state.playerPosition]);

  // ── Hint computation ─────────────────────────────────────────────────────────
  const isHintActive = state.hintCells.length > 0;

  const handleHint = useCallback(() => {
    if (isHintActive) {
      dispatch({ type: 'USE_HINT', cells: [] });
      return;
    }

    const hintSteps = getHintStepCount(maze);
    const pathFromPlayer = currentSolution;
    if (pathFromPlayer.length <= 1) return;

    // Include the current cell so the green hint is anchored at the player's
    // position and remains followable until completed or abandoned.
    dispatch({ type: 'USE_HINT', cells: pathFromPlayer.slice(0, hintSteps + 1) });
  }, [isHintActive, maze, currentSolution]);

  const personalBest = maze.slug ? getPersonalBest(maze.slug) : null;

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
      <div className="flex items-center justify-between w-full max-w-lg gap-3 px-1 flex-wrap">
        <div className="flex items-center gap-3">
          {state.status === 'idle' && (
            <span className="text-sm text-slate-500">Swipe or use arrow keys to start</span>
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
          {state.status === 'paused' && (
            <span className="text-sm font-medium text-amber-600">⏸ Paused</span>
          )}
          {state.status === 'solved' && (
            <span className="text-sm font-semibold text-green-600">
              ✓ Solved in {formatTime(state.elapsedMs)}!
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Hint button */}
          {state.status !== 'solved' && (
            <button
              onClick={handleHint}
              className="text-xs px-3 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium transition-colors"
              title={isHintActive ? 'Hide the current hint' : 'Reveal a followable route segment toward the exit'}
              aria-pressed={isHintActive}
            >
              {isHintActive ? 'Hide Hint' : 'Show Hint'}
            </button>
          )}

          {/* Pause/Resume */}
          {(state.status === 'playing' || state.status === 'paused') && (
            <button
              onClick={() => dispatch({ type: state.status === 'playing' ? 'PAUSE' : 'RESUME' })}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-medium transition-colors"
              aria-label={state.status === 'playing' ? 'Pause timer' : 'Resume timer'}
            >
              {state.status === 'playing' ? '⏸' : '▶'}
            </button>
          )}

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

          {/* Path traveled toggle */}
          <button
            onClick={toggleShowTrail}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-medium transition-colors"
            aria-pressed={showTrail}
          >
            {showTrail ? 'Hide path' : 'Show path'}
          </button>

          {/* Reset */}
          <button
            onClick={() => dispatch({ type: 'RESET', startPosition: maze.entry })}            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-medium transition-colors"
            aria-label="Reset maze"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Personal best display */}
      {personalBest !== null && state.status !== 'solved' && (
        <div className="text-xs text-slate-400 w-full max-w-lg px-1">
          Personal best: <span className="font-medium text-slate-500">{formatTime(personalBest)}</span>
        </div>
      )}

      {/* Maze SVG */}
      <div
        className="relative rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden touch-none"
        style={{ maxWidth: '100%' }}
      >
        <MazeRenderer
          maze={maze}
          cellSize={cellSize}
          playerPosition={state.status !== 'paused' ? state.playerPosition : undefined}
          trail={state.trail}
          showTrail={showTrail}
          solution={currentSolution}
          showSolution={state.solutionVisible}
          hintCells={state.hintCells}
          interactive={isActive}
          svgRef={svgRef}
          markersOutside
        />

        {/* Paused overlay */}
        {state.status === 'paused' && (
          <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center gap-3 rounded-xl">
            <div className="text-4xl" aria-hidden="true">⏸</div>
            <p className="text-slate-700 font-semibold">Paused</p>
            <button
              onClick={() => dispatch({ type: 'RESUME' })}
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              autoFocus
            >
              Resume
            </button>
          </div>
        )}

        {/* Solved overlay */}
        {showSolvedOverlay && (
          <PostSolveOverlay
            elapsedMs={state.elapsedMs}
            stepCount={state.trail.length}
            hintsUsed={state.hintsUsed}
            isNewBest={isNewBestRef.current}
            personalBest={personalBest}
            nav={postSolveNav}
            mazeSlug={maze.slug}
            onPlayAgain={() => {
              isNewBestRef.current = false;
              setShowSolvedOverlay(false);
              dispatch({ type: 'RESET', startPosition: maze.entry });
            }}
          />
        )}
      </div>

      {/* D-pad (mobile only) */}
      <DPad dispatch={dispatch} isActive={isActive} />

      <p className="text-xs text-slate-400 text-center md:hidden" aria-hidden="true">
        Swipe or use D-pad to move
      </p>
      <p className="text-xs text-slate-400 text-center hidden md:block" aria-hidden="true">
        Arrow keys or WASD to run
      </p>
    </div>
  );
}
