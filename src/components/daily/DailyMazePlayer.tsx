/**
 * DailyMazePlayer — client:only React island for the Maze of the Day page.
 *
 * Runs entirely in the browser. Derives today's UTC date, hashes it to a
 * seed, and generates a fresh 60×60 large maze on every page load.
 * Because the seed is a pure function of the UTC date, every user on the
 * same calendar day gets the exact same maze — no server, no rebuild needed.
 */
import { useState, useEffect } from 'react';
import { generateMaze } from '../../lib/maze/generator';
import { getMazesByDifficulty } from '../../lib/catalog/index';
import { dateToSeed } from '../../lib/catalog/index';
import { MazePlayer } from '../maze/MazePlayer';
import type { MazeData } from '../../types/maze';
import type { PostSolveNav } from '../maze/PostSolveOverlay';

function getUTCDateString(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DailyMazePlayer() {
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [postSolveNav, setPostSolveNav] = useState<PostSolveNav | null>(null);

  useEffect(() => {
    const today = getUTCDateString();
    const seed = dateToSeed(today);

    const generated = generateMaze({ width: 60, height: 60, difficulty: 'large', seed });
    generated.id = `daily-${today}`;
    generated.slug = `daily-${today}`;

    // Pick two distinct large catalog mazes deterministically from the date seed
    // so the post-solve "play another" and "random" links are stable per day.
    const largePool = getMazesByDifficulty('large');
    const nextMaze = largePool[seed % largePool.length];
    const randomMaze = largePool[(seed + 7) % largePool.length] ?? nextMaze;

    const nav: PostSolveNav = {
      nextSlug: nextMaze.slug,
      nextLabel: 'Play Another Large Maze',
      randomSlug: randomMaze.slug,
      categorySlug: 'large-mazes',
      categoryLabel: 'Large',
    };

    setMaze(generated);
    setPostSolveNav(nav);
  }, []);

  if (!maze || !postSolveNav) {
    return <LoadingSkeleton />;
  }

  return <MazePlayer maze={maze} postSolveNav={postSolveNav} />;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 py-24">
      <svg
        className="w-8 h-8 text-blue-400 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
      </svg>
      <p className="text-sm text-slate-500">Generating today's maze…</p>
    </div>
  );
}
