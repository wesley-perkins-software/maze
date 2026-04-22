import { useState, useCallback, useRef } from 'react';
import type { Difficulty } from '../../types/maze';
import { generateMaze } from '../../lib/maze/index';
import { MazeRenderer } from './MazeRenderer';
import { FullscreenMazePlayer } from './FullscreenMazePlayer';
import type { SolveStats } from './FullscreenMazePlayer';
import { PostSolveOverlay } from './PostSolveOverlay';

type CoreDifficulty = 'easy' | 'medium' | 'hard';
type SizePreset = 'small' | 'medium' | 'large';

const DIFFICULTY_OPTIONS: { value: CoreDifficulty; label: string; description: string }[] = [
  { value: 'easy',   label: 'Easy',   description: 'Open paths, few dead ends' },
  { value: 'medium', label: 'Medium', description: 'Balanced challenge' },
  { value: 'hard',   label: 'Hard',   description: 'Maximum dead ends' },
];

const SIZE_OPTIONS: { value: SizePreset; label: string; detail: string }[] = [
  { value: 'small',  label: 'Small',  detail: '20 × 20' },
  { value: 'medium', label: 'Medium', detail: '40 × 40' },
  { value: 'large',  label: 'Large',  detail: '60 × 60' },
];

const SIZE_MAP: Record<SizePreset, { w: number; h: number }> = {
  small:  { w: 20, h: 20 },
  medium: { w: 40, h: 40 },
  large:  { w: 60, h: 60 },
};

const CUSTOM_RANGES: Record<CoreDifficulty, { min: number; max: number }> = {
  easy:   { min: 4,  max: 40 },
  medium: { min: 6,  max: 50 },
  hard:   { min: 8,  max: 60 },
};

function newSeed() {
  return Math.floor(Math.random() * 999999);
}

export function MazeGenerator() {
  const [difficulty, setDifficulty] = useState<CoreDifficulty>('medium');
  const [sizePreset, setSizePreset] = useState<SizePreset>('medium');
  const [showCustom, setShowCustom] = useState(false);
  const [customWidth, setCustomWidth]   = useState(12);
  const [customHeight, setCustomHeight] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [solved, setSolved]   = useState(false);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const hasPlayedRef = useRef(false);

  const getDimensions = useCallback(
    () => showCustom ? { w: customWidth, h: customHeight } : SIZE_MAP[sizePreset],
    [showCustom, customWidth, customHeight, sizePreset],
  );

  const [maze, setMaze] = useState(() => {
    const { w, h } = SIZE_MAP['medium'];
    return generateMaze({ width: w, height: h, difficulty: 'medium', seed: newSeed() });
  });

  const generate = useCallback((diff: CoreDifficulty, dims: { w: number; h: number }) => {
    const m = generateMaze({ width: dims.w, height: dims.h, difficulty: diff as Difficulty, seed: newSeed() });
    setMaze(m);
    setPlaying(false);
    setSolved(false);
    setSolveStats(null);
  }, []);

  const handleDifficultyChange = useCallback((d: CoreDifficulty) => {
    setDifficulty(d);
    generate(d, getDimensions());
  }, [getDimensions, generate]);

  const handleSizeChange = useCallback((s: SizePreset) => {
    setSizePreset(s);
    setShowCustom(false);
    generate(difficulty, SIZE_MAP[s]);
  }, [difficulty, generate]);

  const handleGenerate = useCallback(() => {
    generate(difficulty, getDimensions());
  }, [difficulty, getDimensions, generate]);

  const handlePlay = useCallback(() => {
    hasPlayedRef.current = true;
    setPlaying(true);
    setSolved(false);
  }, []);

  const handleSolve = useCallback((stats: SolveStats) => {
    setSolveStats(stats);
    setSolved(true);
  }, []);

  const handleTryHarder = useCallback(() => {
    const next: CoreDifficulty = difficulty === 'easy' ? 'medium' : 'hard';
    setDifficulty(next);
    generate(next, getDimensions());
  }, [difficulty, getDimensions, generate]);

  const handleDownloadSVG = useCallback(() => {
    const svgEl = document.querySelector('.maze-generator-svg svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const { w, h } = getDimensions();
    a.href = url;
    a.download = `maze-${difficulty}-${w}x${h}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [difficulty, getDimensions]);

  const handlePrint = useCallback(() => window.print(), []);

  const toggleCustom = useCallback(() => {
    setShowCustom((prev) => {
      if (!prev) {
        const { w, h } = SIZE_MAP[sizePreset];
        setCustomWidth(w);
        setCustomHeight(h);
      }
      return !prev;
    });
  }, [sizePreset]);

  const { w: width, h: height } = getDimensions();
  const cellSize = Math.max(8, Math.min(28, Math.floor(480 / Math.max(width, height))));

  const buttonBase = 'rounded-lg border py-2.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
  const activeBtn  = 'border-blue-500 bg-blue-50 text-blue-700';
  const inactiveBtn = 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-slate-50';

  return (
    <div className="flex flex-col lg:flex-row-reverse gap-6 items-start">

      {/* ── Maze panel — top on mobile, right on desktop ── */}
      <div className="flex-1 min-w-0 w-full">
        <div className="maze-generator-svg rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex justify-center p-4">
            <MazeRenderer maze={maze} cellSize={cellSize} />
          </div>
        </div>

        {playing && (
          <FullscreenMazePlayer
            key={playerKey}
            maze={maze}
            onSolve={handleSolve}
            onClose={() => setPlaying(false)}
          />
        )}

        {/* Rendered at z-[60] so it covers the still-mounted player (z-50).
            useLayoutEffect in the player guarantees this mounts before any
            ghost-click events can fire, so the backdrop absorbs stray touches. */}
        {solveStats && (
          <div className="fixed inset-0 z-[60]">
            <PostSolveOverlay
              elapsedMs={solveStats.elapsedMs}
              stepCount={solveStats.stepCount}
              hintsUsed={solveStats.hintsUsed}
              isNewBest={solveStats.isNewBest}
              personalBest={null}
              onPlayAgain={() => {
                setSolveStats(null);
                setSolved(false);
                setPlayerKey(k => k + 1);
              }}
              onClose={() => {
                setSolveStats(null);
                setPlaying(false);
              }}
            />
          </div>
        )}

        {/* Post-solve CTA */}
        {solved && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm font-medium text-green-800">Nice work! Ready for another?</p>
            <div className="flex gap-2 shrink-0">
              {difficulty !== 'hard' && (
                <button
                  onClick={handleTryHarder}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Try Harder →
                </button>
              )}
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors"
              >
                New Maze
              </button>
            </div>
          </div>
        )}

        {/* Play nudge — shown until first play */}
        {!playing && !solved && !hasPlayedRef.current && (
          <p className="mt-3 text-center text-sm text-slate-400">
            Hit <strong className="text-slate-500">▶ Play</strong> to solve it interactively
          </p>
        )}

        <div className="mt-4 text-center text-sm text-slate-500">
          Looking for pre-made mazes?{' '}
          <a href="/easy-mazes" className="text-blue-600 font-medium hover:underline">
            Browse the maze library →
          </a>
        </div>
      </div>

      {/* ── Controls panel — bottom on mobile, left on desktop ── */}
      <div className="w-full lg:w-72 shrink-0 space-y-5">

        {/* Difficulty */}
        <fieldset>
          <legend className="block text-sm font-semibold text-slate-700 mb-2">Difficulty</legend>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleDifficultyChange(value)}
                className={`${buttonBase} ${difficulty === value ? activeBtn : inactiveBtn}`}
                aria-pressed={difficulty === value}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {DIFFICULTY_OPTIONS.find(d => d.value === difficulty)?.description}
          </p>
        </fieldset>

        {/* Size */}
        <fieldset>
          <legend className="block text-sm font-semibold text-slate-700 mb-2">Size</legend>
          <div className="grid grid-cols-3 gap-2">
            {SIZE_OPTIONS.map(({ value, label, detail }) => (
              <button
                key={value}
                onClick={() => handleSizeChange(value)}
                className={`${buttonBase} flex flex-col items-center leading-tight px-1 ${
                  !showCustom && sizePreset === value ? activeBtn : inactiveBtn
                }`}
                aria-pressed={!showCustom && sizePreset === value}
              >
                <span>{label}</span>
                <span className="text-xs font-normal opacity-60">{detail}</span>
              </button>
            ))}
          </div>

          <button
            onClick={toggleCustom}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showCustom ? '− Hide custom size' : '+ Custom size'}
          </button>

          {showCustom && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <label htmlFor="maze-width" className="text-xs font-medium text-slate-600">Width</label>
                  <span className="text-xs font-mono text-slate-400">{customWidth} cells</span>
                </div>
                <input
                  id="maze-width"
                  type="range"
                  min={CUSTOM_RANGES[difficulty].min}
                  max={CUSTOM_RANGES[difficulty].max}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label htmlFor="maze-height" className="text-xs font-medium text-slate-600">Height</label>
                  <span className="text-xs font-mono text-slate-400">{customHeight} cells</span>
                </div>
                <input
                  id="maze-height"
                  type="range"
                  min={CUSTOM_RANGES[difficulty].min}
                  max={CUSTOM_RANGES[difficulty].max}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* Actions */}
        <div className="space-y-2.5">
          {/* Primary */}
          <button
            onClick={handlePlay}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play This Maze
          </button>

          {/* Secondary */}
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Generate New Maze
          </button>

          {/* Tertiary */}
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSVG}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download SVG
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
