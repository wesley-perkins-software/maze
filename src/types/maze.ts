// ─── Difficulty (tier) ─────────────────────────────────────────────────────────
//
//  "Difficulty" is synonymous with size tier. Five values map to the five
//  library sizes. Expert and Monster are library-only tiers (no generator
//  presets expose custom sizes in this range, but they use the same generator).

export type Difficulty = 'small' | 'medium' | 'large' | 'expert' | 'monster';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  small:   'Small',
  medium:  'Medium',
  large:   'Large',
  expert:  'Expert',
  monster: 'Monster',
};

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  small:   'Quick, approachable mazes — 20×20 grid.',
  medium:  'Focused challenge with real decision points — 40×40 grid.',
  large:   'A genuine labyrinth. Easy to get lost — 60×60 grid.',
  expert:  'Serious maze challenge with long corridors — 80×80 grid.',
  monster: 'Extreme maze puzzle for committed solvers — 100×100 grid.',
};

// ─── Coordinate ────────────────────────────────────────────────────────────────

export type Point = {
  x: number; // column index, 0-based
  y: number; // row index, 0-based
};

// ─── Wall Encoding ─────────────────────────────────────────────────────────────
//
//  Each cell's walls are bit-packed into a single number 0–15:
//    bit 0 (value 1)  = North wall present
//    bit 1 (value 2)  = East  wall present
//    bit 2 (value 4)  = South wall present
//    bit 3 (value 8)  = West  wall present
//
//  A wall being "present" means there is NO passage in that direction.
//  A wall being "absent" (bit = 0) means there IS a passage.
//
//  Example: cell value 9 (0b1001) → North and West walls present,
//                                     East and South are open passages.

export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;

export type CellWalls = number; // 0–15

// Flat row-major array: index = y * width + x
export type MazeGrid = CellWalls[];

// ─── Core Maze Data ────────────────────────────────────────────────────────────

export type MazeData = {
  id: string;           // same as slug
  slug: string;         // e.g. "small-20x20-001"
  difficulty: Difficulty;
  width: number;        // number of columns (cells)
  height: number;       // number of rows (cells)
  seed: number;         // PRNG seed — determines maze shape deterministically
  entry: Point;         // start cell, default { x: 0, y: 0 }
  exit: Point;          // end cell, default { x: width-1, y: height-1 }
  grid: MazeGrid;       // flat bit-packed wall array, length = width * height
  solution: number[];   // flat cell indices of BFS shortest path, entry→exit
  generatedAt: string;  // ISO 8601 timestamp
};

// ─── Catalog Types ─────────────────────────────────────────────────────────────

export type MazeCatalogEntry = {
  slug: string;
  difficulty: Difficulty;
  width: number;
  height: number;
  seed: number;
};

export type MazeCatalog = {
  version: number;
  mazes: MazeCatalogEntry[];
};

// ─── Library Catalog Types ─────────────────────────────────────────────────────
//
//  The library catalog (src/data/libraryCatalog.json) uses clean IDs instead of
//  slugs and covers all five size tiers including Expert and Monster.

export type LibraryCatalogEntry = {
  id: string;          // e.g. "small-001", "expert-025", "monster-015"
  difficulty: Difficulty;
  width: number;
  height: number;
  seed: number;
};

export type LibraryCatalog = {
  version: number;
  mazes: LibraryCatalogEntry[];
};

// ─── SEO Helpers ───────────────────────────────────────────────────────────────

export type MazeSeoMeta = {
  title: string;
  description: string;
  slug: string;
  difficulty: Difficulty;
  width: number;
  height: number;
};

// ─── Category Page Info ────────────────────────────────────────────────────────

export type CategoryInfo = {
  difficulty: Difficulty;
  slug: string;         // e.g. "small-mazes"
  label: string;        // e.g. "Small Mazes"
  title: string;        // page <title>
  description: string;  // meta description
  h1: string;
};

export const CATEGORIES: CategoryInfo[] = [
  {
    difficulty: 'small',
    slug: 'small-mazes',
    label: 'Small Mazes',
    title: 'Small Mazes — 40 Free Maze Puzzles to Play Online | MazeThis',
    description:
      'Play 40 free small maze puzzles online. Quick, approachable challenges on a 20×20 grid. Track your progress and complete the collection.',
    h1: 'Small Mazes',
  },
  {
    difficulty: 'medium',
    slug: 'medium-mazes',
    label: 'Medium Mazes',
    title: 'Medium Mazes — 40 Free Maze Puzzles to Play Online | MazeThis',
    description:
      'Play 40 free medium maze puzzles online. Real branching paths and decision points on a 40×40 grid. Track your progress and complete the collection.',
    h1: 'Medium Mazes',
  },
  {
    difficulty: 'large',
    slug: 'large-mazes',
    label: 'Large Mazes',
    title: 'Large Mazes — 40 Free Maze Puzzles to Play Online | MazeThis',
    description:
      'Play 40 free large maze puzzles online. Dense labyrinths on a 60×60 grid that are genuinely easy to get lost in. Complete the full collection.',
    h1: 'Large Mazes',
  },
  {
    difficulty: 'expert',
    slug: 'expert-mazes',
    label: 'Expert Mazes',
    title: 'Expert Mazes — 25 Hard Maze Puzzles to Play Online | MazeThis',
    description:
      'Play 25 free expert maze puzzles online. Long corridors and deep branching on an 80×80 grid. A serious challenge for experienced solvers.',
    h1: 'Expert Mazes',
  },
  {
    difficulty: 'monster',
    slug: 'monster-mazes',
    label: 'Monster Mazes',
    title: 'Monster Mazes — 15 Extreme Maze Puzzles to Play Online | MazeThis',
    description:
      'Play 15 free monster maze puzzles online. Extreme 100×100 labyrinths — the hardest mazes in the MazeThis collection. For committed solvers only.',
    h1: 'Monster Mazes',
  },
];

export function getCategoryByDifficulty(diff: Difficulty): CategoryInfo {
  const cat = CATEGORIES.find((c) => c.difficulty === diff);
  if (!cat) throw new Error(`Unknown difficulty: ${diff}`);
  return cat;
}

export function getCategoryBySlug(slug: string): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
