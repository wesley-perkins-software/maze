import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type { MazeData } from '../../types/maze';
import { MazeRenderer } from './MazeRenderer';
import { Timer } from './Timer';
import { gameReducer, createInitialState } from '../../lib/gameplay/reducer';
import { useKeyboardInput, useTouchInput } from '../../lib/gameplay/input';
import { DPad } from './DPad';

const PLAY_CELL_SIZE = 20;
const PADDING = 8;
const TOP_BAR_H = 56;
const HINT_LOOKAHEAD = 6;
const PERSONAL_BEST_KEY = (slug: string) => `pb:${slug}`;

function getPersonalBest(slug: string): number | null {
  try {
    const raw = localStorage.getItem(PERSONAL_BEST_KEY(slug));
    return raw ? parseInt(raw, 10) : null;
  } catch { return null; }
}

function savePersonalBest(slug: string, ms: number): boolean {
  try {
    const prev = getPersonalBest(slug);
    if (prev === null || ms < prev) {
      localStorage.setItem(PERSONAL_BEST_KEY(slug), String(ms));
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export interface FullscreenMazePlayerProps {
  maze: MazeData;
  onSolve?: () => void;
  onClose: () => void;
}

export function FullscreenMazePlayer({ maze, onSolve, onClose }: FullscreenMazePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);
  const isNewBestRef = useRef(false);

  const [vpSize, setVpSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));

  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof createInitialState>, a: Parameters<typeof gameReducer>[1]) =>
      gameReducer(s, a, maze),
    maze,
    createInitialState,
  );

  // Timer tick
  useEffect(() => {
    if (state.status !== 'playing' || state.startTime === null) return;
    const id = setInterval(() => {
      dispatch({ type: 'TICK', elapsedMs: Date.now() - state.startTime! });
    }, 1000);
    return () => clearInterval(id);
  }, [state.status, state.startTime]);

  // Personal best on solve
  useEffect(() => {
    if (state.status === 'solved') {
      if (maze.slug) isNewBestRef.current = savePersonalBest(maze.slug, state.elapsedMs);
      onSolve?.();
    }
  }, [state.status]);

  // Screen reader announcement
  useEffect(() => {
    if (state.status === 'solved' && announcerRef.current) {
      announcerRef.current.textContent = `Maze solved in ${Math.floor(state.elapsedMs / 1000)} seconds!`;
    }
  }, [state.status]);

  // Track viewport size for camera math
  useEffect(() => {
    const update = () => setVpSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Lock body scroll while fullscreen
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isActive = state.status === 'playing' || state.status === 'idle';
  useKeyboardInput(dispatch, isActive);
  useTouchInput(svgRef, dispatch, isActive);

  const handleHint = useCallback(() => {
    const { solution } = maze;
    if (!solution.length) return;
    const currentIdx = state.playerPosition.y * maze.width + state.playerPosition.x;
    const pos = solution.indexOf(currentIdx);
    const slice = solution.slice(pos !== -1 ? pos + 1 : 0, (pos !== -1 ? pos + 1 : 0) + HINT_LOOKAHEAD);
    if (!slice.length) return;
    dispatch({ type: 'USE_HINT', cells: slice });
    setTimeout(() => dispatch({ type: 'USE_HINT', cells: [] }), 3000);
  }, [maze, state.playerPosition]);

  // ── Follow-camera math ───────────────────────────────────────────────────────
  const mazeW = maze.width * PLAY_CELL_SIZE + PADDING * 2;
  const mazeH = maze.height * PLAY_CELL_SIZE + PADDING * 2;

  const playerPx = PADDING + state.playerPosition.x * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;
  const playerPy = PADDING + state.playerPosition.y * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;

  // D-pad is ~200px tall on mobile, hidden on md+
  const dpadArea = vpSize.w < 768 ? 200 : 0;
  const viewW = vpSize.w;
  const viewH = vpSize.h - TOP_BAR_H - dpadArea;

  let tx: number;
  let ty: number;

  if (mazeW <= viewW) {
    tx = (viewW - mazeW) / 2;
  } else {
    tx = Math.min(0, Math.max(viewW - mazeW, viewW / 2 - playerPx));
  }

  if (mazeH <= viewH) {
    ty = (viewH - mazeH) / 2;
  } else {
    ty = Math.min(0, Math.max(viewH - mazeH, viewH / 2 - playerPy));
  }

  // ── Minimap ──────────────────────────────────────────────────────────────────
  const MINIMAP_PX = 96;
  // Use ceil so SVG intrinsic width > container → CSS scales it down cleanly
  const minimapCell = Math.max(1, Math.ceil((MINIMAP_PX + 4) / Math.max(maze.width, maze.height)));

  const personalBest = maze.slug ? getPersonalBest(maze.slug) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900"
      style={{ touchAction: 'none' }}
    >
      <div ref={announcerRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 px-3 shrink-0 bg-slate-800 text-white"
        style={{ height: TOP_BAR_H }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors shrink-0"
          aria-label="Exit play mode"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          Exit
        </button>

        <div className="text-sm text-slate-300 min-w-0">
          {state.status === 'playing' && (
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                <polyline points="12 6 12 12 16 14" strokeWidth="2"/>
              </svg>
              <Timer elapsedMs={state.elapsedMs} />
            </span>
          )}
          {state.status === 'paused'  && <span className="text-amber-400 font-medium">⏸ Paused</span>}
          {state.status === 'idle'    && <span className="text-slate-400 text-xs">Arrow keys, WASD, or D-pad</span>}
          {state.status === 'solved'  && <span className="text-green-400 font-semibold">✓ {formatTime(state.elapsedMs)}</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {state.status !== 'solved' && (
            <button
              onClick={handleHint}
              className="text-xs px-2 py-1 rounded border border-amber-500/60 text-amber-300 hover:bg-amber-900/40 transition-colors"
            >
              {state.hintsUsed > 0 ? `Hint (${state.hintsUsed})` : 'Hint'}
            </button>
          )}
          {(state.status === 'playing' || state.status === 'paused') && (
            <button
              onClick={() => dispatch({ type: state.status === 'playing' ? 'PAUSE' : 'RESUME' })}
              className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
              aria-label={state.status === 'playing' ? 'Pause timer' : 'Resume timer'}
            >
              {state.status === 'playing' ? '⏸' : '▶'}
            </button>
          )}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SOLUTION' })}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              state.solutionVisible
                ? 'border-green-500/60 text-green-400 bg-green-900/30'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
            aria-pressed={state.solutionVisible}
          >
            {state.solutionVisible ? 'Hide' : 'Solve'}
          </button>
          <button
            onClick={() => dispatch({ type: 'RESET', startPosition: maze.entry })}
            className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
            aria-label="Reset maze"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Maze viewport — clips the larger-than-screen SVG */}
      <div className="relative flex-1 overflow-hidden bg-slate-100">

        {/* Follow-camera pan container */}
        <div
          style={{
            position: 'absolute',
            width: mazeW,
            height: mazeH,
            transform: `translate(${tx}px, ${ty}px)`,
            transition: 'transform 0.12s ease-out',
            willChange: 'transform',
          }}
        >
          <MazeRenderer
            maze={maze}
            cellSize={PLAY_CELL_SIZE}
            padding={PADDING}
            playerPosition={state.status !== 'paused' ? state.playerPosition : undefined}
            trail={state.trail}
            solution={maze.solution}
            showSolution={state.solutionVisible}
            hintCells={state.hintCells}
            interactive={isActive}
            svgRef={svgRef}
          />
        </div>

        {/* Minimap */}
        <div
          className="absolute top-2 right-2 rounded-lg border border-slate-300 bg-white/90 shadow overflow-hidden"
          style={{ width: MINIMAP_PX + 4, height: MINIMAP_PX + 4, padding: 2 }}
          aria-hidden="true"
        >
          <MazeRenderer
            maze={maze}
            cellSize={minimapCell}
            wallThickness={1}
            padding={2}
            playerPosition={state.playerPosition}
          />
        </div>

        {/* Paused overlay */}
        {state.status === 'paused' && (
          <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center gap-3">
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
        {state.status === 'solved' && (
          <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3 p-4">
            <div className="text-4xl" aria-hidden="true">🎉</div>
            <h3 className="text-xl font-bold text-slate-800">Maze Solved!</h3>
            <p className="text-slate-600 text-sm text-center">
              Time: <strong>{formatTime(state.elapsedMs)}</strong>
              {state.trail.length > 0 && ` · ${state.trail.length} steps`}
              {state.hintsUsed > 0 && ` · ${state.hintsUsed} hint${state.hintsUsed > 1 ? 's' : ''}`}
            </p>
            {isNewBestRef.current && (
              <p className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                ★ New personal best!
              </p>
            )}
            {personalBest !== null && !isNewBestRef.current && (
              <p className="text-xs text-slate-400">Personal best: {formatTime(personalBest)}</p>
            )}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { isNewBestRef.current = false; dispatch({ type: 'RESET', startPosition: maze.entry }); }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                autoFocus
              >
                Play Again
              </button>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Exit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* D-pad — mobile only */}
      <div className="bg-slate-900 shrink-0">
        <DPad dispatch={dispatch} isActive={isActive} />
        <p className="text-xs text-slate-500 text-center pb-2 md:hidden" aria-hidden="true">
          Tap controls or swipe to move
        </p>
      </div>
    </div>
  );
}
