/**
 * MazeGenerator — Interactive maze generation island.
 * Lets users choose difficulty, width, height, see a live preview,
 * and download or print the result.
 */
import { useState, useCallback } from 'react';
import type { Difficulty } from '../../types/maze';
import { DIFFICULTY_LABELS } from '../../types/maze';
import { generateMaze } from '../../lib/maze/index';
import { MazeRenderer } from './MazeRenderer';
import { MazePlayer } from './MazePlayer';

const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'medium', 'hard', 'kids', 'adults'];

const SIZE_PRESETS: Record<Difficulty, { min: number; max: number; default: number }> = {
  kids:   { min: 4, max: 10,  default: 6  },
  easy:   { min: 5, max: 15,  default: 8  },
  medium: { min: 8, max: 20,  default: 12 },
  hard:   { min: 10, max: 30, default: 15 },
  adults: { min: 12, max: 35, default: 20 },
};

export function MazeGenerator() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [width, setWidth]   = useState(12);
  const [height, setHeight] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 999999));

  const [maze, setMaze] = useState(() =>
    generateMaze({ width: 12, height: 12, difficulty: 'medium', seed }),
  );

  const preset = SIZE_PRESETS[difficulty];

  const handleGenerate = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 999999);
    const m = generateMaze({ width, height, difficulty, seed: newSeed });
    setMaze(m);
    setPlaying(false);
  }, [width, height, difficulty]);

  const handleDifficultyChange = useCallback((d: Difficulty) => {
    setDifficulty(d);
    const p = SIZE_PRESETS[d];
    const clampedW = Math.max(p.min, Math.min(p.max, width));
    const clampedH = Math.max(p.min, Math.min(p.max, height));
    setWidth(clampedW);
    setHeight(clampedH);
    const newSeed = Math.floor(Math.random() * 999999);
    setMaze(generateMaze({ width: clampedW, height: clampedH, difficulty: d, seed: newSeed }));
    setPlaying(false);
  }, [width, height]);

  const handleDownloadSVG = useCallback(() => {
    const svgEl = document.querySelector('.maze-generator-svg svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maze-${difficulty}-${width}x${height}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [difficulty, width, height]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const cellSize = Math.max(14, Math.min(28, Math.floor(400 / Math.max(width, height))));

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Form panel */}
      <div className="w-full lg:w-80 shrink-0 space-y-6">
        {/* Difficulty */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Difficulty
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => handleDifficultyChange(d)}
                className={`rounded-lg border py-2 text-sm font-medium transition-all ${
                  difficulty === d
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                }`}
                aria-pressed={difficulty === d}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Width */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="maze-width" className="text-sm font-semibold text-slate-700">
              Width
            </label>
            <span className="text-sm font-mono text-slate-500">{width} cells</span>
          </div>
          <input
            id="maze-width"
            type="range"
            min={preset.min}
            max={preset.max}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        {/* Height */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="maze-height" className="text-sm font-semibold text-slate-700">
              Height
            </label>
            <span className="text-sm font-mono text-slate-500">{height} cells</span>
          </div>
          <input
            id="maze-height"
            type="range"
            min={preset.min}
            max={preset.max}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Generate New Maze
          </button>

          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {playing ? '👁 View Maze' : '▶ Play This Maze'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleDownloadSVG}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download SVG
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Maze preview / player */}
      <div className="flex-1 min-w-0">
        {playing ? (
          <MazePlayer maze={maze} />
        ) : (
          <div className="maze-generator-svg flex justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <MazeRenderer maze={maze} cellSize={cellSize} />
          </div>
        )}

        {/* Browse library CTA */}
        <div className="mt-4 text-center text-sm text-slate-500">
          Looking for pre-made mazes?{' '}
          <a href="/easy-mazes" className="text-blue-600 font-medium hover:underline">
            Browse the maze library →
          </a>
        </div>
      </div>
    </div>
  );
}
