// ─── Difficulty ────────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard' | 'kids' | 'adults';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  kids: 'Kids',
  adults: 'Adults',
};

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  easy: 'Wide open paths, perfect for beginners and young children.',
  medium: 'Balanced challenge with moderate dead ends.',
  hard: 'Maximum dead ends and long winding paths — a real challenge.',
  kids: 'Small, friendly mazes designed for young children.',
  adults: 'Large, complex mazes for experienced solvers.',
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
  slug: string;         // e.g. "easy-5x5-001"
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
  slug: string;         // e.g. "easy-mazes"
  label: string;        // e.g. "Easy Mazes"
  title: string;        // page <title>
  description: string;  // meta description
  h1: string;
};

export const CATEGORIES: CategoryInfo[] = [
  {
    difficulty: 'easy',
    slug: 'easy-mazes',
    label: 'Easy Mazes',
    title: 'Free Easy Mazes to Print & Play | MazeThis',
    description:
      'Browse 90 free printable easy mazes. Download and print or play online. Perfect for beginners and young kids. No account needed.',
    h1: 'Free Printable Easy Mazes',
  },
  {
    difficulty: 'medium',
    slug: 'medium-mazes',
    label: 'Medium Mazes',
    title: 'Free Medium Mazes to Print & Play | MazeThis',
    description:
      'Browse 90 free printable medium difficulty mazes. Balanced challenge for all ages. Print or solve online with arrow keys.',
    h1: 'Free Printable Medium Mazes',
  },
  {
    difficulty: 'hard',
    slug: 'hard-mazes',
    label: 'Hard Mazes',
    title: 'Free Hard Mazes to Print & Play | MazeThis',
    description:
      'Browse 75 free printable hard mazes. Maximum dead ends for experienced solvers. Download and print or play online.',
    h1: 'Free Printable Hard Mazes',
  },
  {
    difficulty: 'kids',
    slug: 'mazes-for-kids',
    label: 'Mazes for Kids',
    title: 'Free Printable Mazes for Kids | MazeThis',
    description:
      'Browse 90 free printable mazes for kids. Simple, fun mazes perfect for children ages 4–8. Print for free or solve online.',
    h1: 'Free Printable Mazes for Kids',
  },
  {
    difficulty: 'adults',
    slug: 'mazes-for-adults',
    label: 'Mazes for Adults',
    title: 'Free Printable Mazes for Adults | MazeThis',
    description:
      'Browse 75 free large printable mazes for adults. Challenging puzzles to print or solve online. No account needed.',
    h1: 'Free Printable Mazes for Adults',
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
