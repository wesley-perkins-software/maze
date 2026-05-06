// ─── Difficulty (tier) ─────────────────────────────────────────────────────────
//
//  "Difficulty" is now synonymous with size tier. The three values map directly
//  to the Small / Medium / Large options shown in the UI.

export type Difficulty = 'small' | 'medium' | 'large';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  small:  'Small',
  medium: 'Medium',
  large:  'Large',
};

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  small:  'Quick, approachable mazes — 20×20 grid.',
  medium: 'Focused challenge with real decision points — 40×40 grid.',
  large:  'A genuine labyrinth. Easy to get lost — 60×60 grid.',
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
    title: 'Free Small Mazes to Print & Play | MazeThis',
    description:
      'Browse 60 free printable small mazes on a 20×20 grid. Quick and approachable — perfect for all ages. Play online or download to print.',
    h1: 'Free Printable Small Mazes',
  },
  {
    difficulty: 'medium',
    slug: 'medium-mazes',
    label: 'Medium Mazes',
    title: 'Free Medium Mazes to Print & Play | MazeThis',
    description:
      'Browse 50 free printable medium mazes on a 40×40 grid. Real branching and decision points — a focused challenge for any solver.',
    h1: 'Free Printable Medium Mazes',
  },
  {
    difficulty: 'large',
    slug: 'large-mazes',
    label: 'Large Mazes',
    title: 'Free Large Mazes to Print & Play | MazeThis',
    description:
      'Browse 40 free printable large mazes on a 60×60 grid. Dense, looping labyrinths that are easy to get lost in. A genuine challenge.',
    h1: 'Free Printable Large Mazes',
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
