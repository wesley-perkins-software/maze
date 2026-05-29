/**
 * Generates /sitemap.xml at build time.
 * Includes category pages, maze-guides pages, and top-level pages.
 * Excludes /learn/* (redirected to /maze-guides/*), /blog/* (redirected),
 * /play/library/* (noindex), and old /mazes/* routes.
 */
import type { APIRoute } from 'astro';
import { CATEGORIES } from '../types/maze';

const SITE = 'https://mazethis.com';

function url(path: string, priority: string, changefreq: string): string {
  return `  <url>
    <loc>${SITE}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: APIRoute = async () => {
  const staticUrls = [
    url('/', '1.0', 'weekly'),
    url('/maze-of-the-day', '0.9', 'daily'),
    url('/maze-generator', '0.9', 'monthly'),
    url('/maze-library', '0.9', 'monthly'),
    url('/printable-mazes', '0.9', 'monthly'),
    url('/faq', '0.7', 'monthly'),
    url('/maze-guides', '0.8', 'weekly'),
    url('/maze-guides/how-to-solve-a-maze', '0.7', 'monthly'),
    url('/maze-guides/how-mazes-work', '0.7', 'monthly'),
    url('/maze-guides/maze-difficulty', '0.7', 'monthly'),
    url('/maze-guides/maze-types', '0.7', 'monthly'),
    url('/maze-guides/mazes-for-kids', '0.7', 'monthly'),
    url('/maze-guides/mazes-for-classroom', '0.7', 'monthly'),
    url('/maze-guides/mazes-for-seniors', '0.7', 'monthly'),
    url('/maze-guides/daily-maze-challenge', '0.7', 'monthly'),
    url('/maze-guides/maze-library', '0.7', 'monthly'),
    url('/maze-guides/printable-maze-worksheets', '0.7', 'monthly'),
    url('/about', '0.5', 'monthly'),
    url('/privacy', '0.3', 'yearly'),
    url('/terms', '0.3', 'yearly'),
  ];

  const categoryUrls = CATEGORIES.map((cat) =>
    url(`/${cat.slug}`, '0.8', 'monthly'),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...categoryUrls].join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
