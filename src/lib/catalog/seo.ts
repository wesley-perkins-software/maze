import type { MazeCatalogEntry, Difficulty, MazeSeoMeta } from '../../types/maze';
import { DIFFICULTY_LABELS } from '../../types/maze';

const ORDINALS: Record<string, string> = {
  '1': '1st', '2': '2nd', '3': '3rd',
};
function ordinal(n: number): string {
  return ORDINALS[String(n)] ?? `${n}th`;
}

/** Extract the sequential number from a slug like "small-20x20-001" → 1 */
function slugIndex(slug: string): number {
  const match = slug.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

export function generateMazeTitle(entry: MazeCatalogEntry): string {
  const tier = DIFFICULTY_LABELS[entry.difficulty];
  const n = slugIndex(entry.slug);
  return `${tier} ${entry.width}×${entry.height} Maze #${n}`;
}

export function generateMazeMetaTitle(entry: MazeCatalogEntry): string {
  return `${generateMazeTitle(entry)} - Free Printable | MazeThis`;
}

export function generateMazeDescription(entry: MazeCatalogEntry): string {
  const tier = DIFFICULTY_LABELS[entry.difficulty].toLowerCase();
  const { width, height } = entry;
  const n = slugIndex(entry.slug);

  const audienceMap: Record<Difficulty, string> = {
    small:   'quick and approachable for all ages',
    medium:  'a focused challenge with real decision points',
    large:   'a dense labyrinth — easy to get lost',
    expert:  'a serious challenge with deep corridors and long paths',
    monster: 'an extreme labyrinth for committed solvers',
  };

  return (
    `Print or play this ${tier} ${width}×${height} maze (#${n}) online for free. ` +
    `It's ${audienceMap[entry.difficulty]}. ` +
    `Solve with arrow keys or download to print.`
  );
}

export function generateMazeSeoMeta(entry: MazeCatalogEntry): MazeSeoMeta {
  return {
    title: generateMazeMetaTitle(entry),
    description: generateMazeDescription(entry),
    slug: entry.slug,
    difficulty: entry.difficulty,
    width: entry.width,
    height: entry.height,
  };
}

export function generateMazeSchemaLD(entry: MazeCatalogEntry, siteUrl: string): string {
  const title = generateMazeTitle(entry);
  const description = generateMazeDescription(entry);
  const url = `${siteUrl}/mazes/${entry.slug}`;
  const tier = DIFFICULTY_LABELS[entry.difficulty];

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: title,
    description,
    url,
    learningResourceType: 'Puzzle',
    educationalLevel: tier,
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: {
      '@type': 'Organization',
      name: 'MazeThis',
      url: siteUrl,
    },
  });
}

export function generateBreadcrumbLD(
  crumbs: Array<{ name: string; url?: string }>,
  siteUrl: string,
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      ...(crumb.url ? { item: `${siteUrl}${crumb.url}` } : {}),
    })),
  });
}
