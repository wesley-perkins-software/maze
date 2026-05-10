import { useState, useCallback, useRef } from 'react';
import type { Difficulty } from '../../types/maze';
import { generateMaze } from '../../lib/maze/index';
import { MazeRenderer } from './MazeRenderer';
import { FullscreenMazePlayer } from './FullscreenMazePlayer';
import type { SolveStats } from './FullscreenMazePlayer';
import { PostSolveOverlay } from './PostSolveOverlay';

type SizePreset = 'small' | 'medium' | 'large' | 'expert' | 'monster';

const SIZE_OPTIONS: { value: SizePreset; label: string; detail: string }[] = [
  { value: 'small',   label: 'Small',   detail: '20 × 20' },
  { value: 'medium',  label: 'Medium',  detail: '40 × 40' },
  { value: 'large',   label: 'Large',   detail: '60 × 60' },
  { value: 'expert',  label: 'Expert',  detail: '80 × 80' },
  { value: 'monster', label: 'Monster', detail: '100 × 100' },
];

const SIZE_MAP: Record<SizePreset, { w: number; h: number }> = {
  small:   { w: 20,  h: 20 },
  medium:  { w: 40,  h: 40 },
  large:   { w: 60,  h: 60 },
  expert:  { w: 80,  h: 80 },
  monster: { w: 100, h: 100 },
};

const CUSTOM_RANGE = { min: 5, max: 100 };

function presetDifficulty(preset: SizePreset): Difficulty {
  if (preset === 'expert' || preset === 'monster') return 'large';
  return preset;
}

function newSeed() {
  return Math.floor(Math.random() * 999999);
}

export function difficultyForCustomSize(w: number, h: number): Difficulty {
  const area = w * h;
  const smallArea  = SIZE_MAP.small.w  * SIZE_MAP.small.h;
  const mediumArea = SIZE_MAP.medium.w * SIZE_MAP.medium.h;
  const largeArea  = SIZE_MAP.large.w  * SIZE_MAP.large.h;

  const smallMediumMidpoint = (smallArea  + mediumArea) / 2;
  const mediumLargeMidpoint = (mediumArea + largeArea)  / 2;

  if (area <= smallMediumMidpoint) return 'small';
  if (area <= mediumLargeMidpoint) return 'medium';
  return 'large';
}

export function MazeGenerator() {
  const [sizePreset, setSizePreset] = useState<SizePreset>('medium');
  const [showCustom, setShowCustom] = useState(false);
  const [customWidth,  setCustomWidth]  = useState(40);
  const [customHeight, setCustomHeight] = useState(40);
  const [playing,   setPlaying]   = useState(false);
  const [solved,    setSolved]    = useState(false);
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

  const generate = useCallback((preset: SizePreset | null, dims: { w: number; h: number }) => {
    const difficulty: Difficulty = preset
      ? presetDifficulty(preset)
      : difficultyForCustomSize(dims.w, dims.h);
    const m = generateMaze({ width: dims.w, height: dims.h, difficulty, seed: newSeed() });
    setMaze(m);
    setPlaying(false);
    setSolved(false);
    setSolveStats(null);
  }, []);

  const handleSizeChange = useCallback((s: SizePreset) => {
    setSizePreset(s);
    setShowCustom(false);
    generate(s, SIZE_MAP[s]);
  }, [generate]);

  const handleGenerate = useCallback(() => {
    if (showCustom) {
      generate(null, { w: customWidth, h: customHeight });
    } else {
      generate(sizePreset, SIZE_MAP[sizePreset]);
    }
  }, [showCustom, customWidth, customHeight, sizePreset, generate]);

  const handlePlay = useCallback(() => {
    hasPlayedRef.current = true;
    setPlaying(true);
    setSolved(false);
  }, []);

  const handleSolve = useCallback((stats: SolveStats) => {
    setSolveStats(stats);
    setSolved(true);
  }, []);

  const handleTryLarger = useCallback(() => {
    const presets: SizePreset[] = ['small', 'medium', 'large', 'expert', 'monster'];
    const idx  = presets.indexOf(sizePreset);
    const next = presets[Math.min(idx + 1, presets.length - 1)];
    setSizePreset(next);
    generate(next, SIZE_MAP[next]);
  }, [sizePreset, generate]);

  const handleDownloadSVG = useCallback(() => {
    const svgEl = document.querySelector('.maze-generator-svg svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const { w, h } = getDimensions();
    a.href     = url;
    a.download = `maze-${w}x${h}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getDimensions]);

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
  const cellSize = Math.max(8, Math.min(28, Math.floor(400 / Math.max(width, height))));

  const btnBase    = 'rounded-sm border py-2.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-arch-accent';
  const activeBtn  = 'border-arch-charcoal bg-arch-charcoal text-white';
  const inactiveBtn = 'border-arch-200 bg-arch-surface text-arch-600 hover:border-arch-charcoal hover:text-arch-charcoal hover:bg-arch-bg';

  const presetLabel = showCustom ? 'Custom' : sizePreset.charAt(0).toUpperCase() + sizePreset.slice(1);

  return (
    <div className="flex flex-col lg:flex-row-reverse gap-6 items-start">

      {/* ── Maze panel — top on mobile, right on desktop ── */}
      <div className="flex-1 min-w-0 w-full">

        {/* Preview card with inset double-rule frame */}
        <div
          className="maze-generator-svg border border-arch-200 bg-arch-surface overflow-hidden"
          style={{
            height:    'clamp(300px, calc(100vh - 300px), 640px)',
            boxShadow: 'inset 0 0 0 5px #FFFFFF, inset 0 0 0 6px #D6D4CF',
          }}
        >
          <div className="flex justify-center items-center w-full h-full p-4">
            <MazeRenderer maze={maze} cellSize={cellSize} fillContainer />
          </div>
        </div>

        {/* Artifact identity strip — attached to card bottom */}
        <div className="border border-arch-200 border-t-0 bg-arch-bg px-3 py-1.5 flex justify-between items-center mb-4">
          <span className="text-xs font-mono text-arch-400">{width} × {height}</span>
          <span className="text-xs font-mono text-arch-400">{presetLabel}</span>
        </div>

        {playing && (
          <FullscreenMazePlayer
            key={playerKey}
            maze={maze}
            onSolve={handleSolve}
            onClose={() => setPlaying(false)}
          />
        )}

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
          <div className="rounded-sm border border-green-200 bg-green-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm font-medium text-green-800">Nice work! Ready for another?</p>
            <div className="flex gap-2 shrink-0">
              {sizePreset !== 'monster' && !showCustom && (
                <button
                  onClick={handleTryLarger}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Try Larger →
                </button>
              )}
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 rounded-sm border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors"
              >
                New Maze
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls panel — below maze on mobile, left on desktop ──
          Mobile order:  1 actions  →  2 size  →  3 browse
          Desktop order: 1 size  →  2 divider  →  3 actions  →  4 browse  */}
      <div className="w-full lg:w-72 shrink-0 flex flex-col gap-4">

        {/* Actions — order-1 mobile (Play visible immediately), order-3 desktop */}
        <div className="order-1 lg:order-3 space-y-2.5">
          {/* Primary */}
          <button
            onClick={handlePlay}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-arch-accent px-5 py-3 text-base font-semibold text-white hover:bg-arch-accent-dark active:bg-arch-accent-dark transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play This Maze
          </button>

          {/* Secondary */}
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm border border-arch-charcoal bg-arch-surface px-5 py-2.5 text-sm font-semibold text-arch-charcoal hover:bg-arch-bg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Generate New Maze
          </button>

          {/* Utility */}
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSVG}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download SVG
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* Size selector — order-2 mobile, order-1 desktop */}
        <fieldset className="order-2 lg:order-1">
          <legend className="block text-xs tracking-widest uppercase font-semibold text-arch-400 mb-2">Size</legend>
          <div className="grid grid-cols-3 gap-2">
            {SIZE_OPTIONS.map(({ value, label, detail }) => (
              <button
                key={value}
                onClick={() => handleSizeChange(value)}
                className={`${btnBase} flex flex-col items-center leading-tight px-1 ${
                  !showCustom && sizePreset === value ? activeBtn : inactiveBtn
                }`}
                aria-pressed={!showCustom && sizePreset === value}
              >
                <span>{label}</span>
                <span className="text-xs font-mono opacity-60">{detail}</span>
              </button>
            ))}
            {/* Custom — sixth slot */}
            <button
              onClick={toggleCustom}
              className={`${btnBase} flex flex-col items-center leading-tight px-1 ${
                showCustom ? activeBtn : inactiveBtn
              }`}
              aria-pressed={showCustom}
            >
              <span>Custom</span>
              <span className="text-xs font-mono opacity-60">up to 100</span>
            </button>
          </div>

          {showCustom && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <label htmlFor="maze-width" className="text-xs font-medium text-arch-600">Width</label>
                  <span className="text-xs font-mono text-arch-400">{customWidth} cells</span>
                </div>
                <input
                  id="maze-width"
                  type="range"
                  min={CUSTOM_RANGE.min}
                  max={CUSTOM_RANGE.max}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Number(e.target.value))}
                  className="w-full accent-arch-charcoal"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label htmlFor="maze-height" className="text-xs font-medium text-arch-600">Height</label>
                  <span className="text-xs font-mono text-arch-400">{customHeight} cells</span>
                </div>
                <input
                  id="maze-height"
                  type="range"
                  min={CUSTOM_RANGE.min}
                  max={CUSTOM_RANGE.max}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Number(e.target.value))}
                  className="w-full accent-arch-charcoal"
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* Divider — hidden on mobile, between size and actions on desktop */}
        <div className="hidden lg:block lg:order-2 border-t border-arch-200" />

        {/* Browse library — always last */}
        <div className="order-3 lg:order-4 text-center">
          <a
            href="/small-mazes"
            className="text-sm text-arch-400 hover:text-arch-accent transition-colors"
          >
            → Browse pre-made mazes
          </a>
        </div>
      </div>
    </div>
  );
}
