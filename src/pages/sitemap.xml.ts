/**
 * Generates /sitemap.xml at build time.
 * Includes all maze pages, category pages, and top-level pages.
 * Excludes /print variants.
 */
import type { APIRoute } from 'astro';
import { getAllMazes } from '../lib/catalog/index';
import { CATEGORIES } from '../types/maze';

const SITE = 'https://mazethis.com';

function url(path: string, priority: string, changefreq: string): string {
  return `  <url>
    <loc>${SITE}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: APIRoute = () => {
  const mazes = getAllMazes();

  const staticUrls = [
    url('/', '1.0', 'weekly'),
    url('/maze-generator', '0.9', 'monthly'),
    url('/about', '0.5', 'monthly'),
  ];

  const categoryUrls = CATEGORIES.map((cat) =>
    url(`/${cat.slug}`, '0.8', 'monthly'),
  );

  const mazeUrls = mazes.map((m) =>
    url(`/mazes/${m.slug}`, '0.6', 'yearly'),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...categoryUrls, ...mazeUrls].join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
