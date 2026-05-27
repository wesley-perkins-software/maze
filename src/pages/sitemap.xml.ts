/**
 * Generates /sitemap.xml at build time.
 * Includes category pages, learn pages, and top-level pages.
 * Excludes old /mazes/* routes (deleted in PR 3), /play/library/* (noindex),
 * and /blog/* (redirected to /learn/* via netlify.toml).
 */
import type { APIRoute } from 'astro';
import { CATEGORIES } from '../types/maze';

const SITE = 'https://mazethis.com';

function url(path: string, priority: string, changefreq: string, lastmod?: string): string {
  return `  <url>
    <loc>${SITE}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
  </url>`;
}

export const GET: APIRoute = async () => {
  const staticUrls = [
    url('/', '1.0', 'weekly'),
    url('/maze-of-the-day/', '0.9', 'daily'),
    url('/maze-generator', '0.9', 'monthly'),
    url('/maze-library', '0.9', 'monthly'),
    url('/printable-mazes', '0.9', 'monthly'),
    url('/faq', '0.7', 'monthly'),
    url('/learn', '0.8', 'weekly'),
    url('/learn/how-to-solve-a-maze', '0.7', 'monthly', '2024-11-20'),
    url('/learn/how-mazes-work', '0.7', 'monthly', '2024-11-01'),
    url('/mazes-for-classroom', '0.7', 'monthly'),
    url('/mazes-for-seniors', '0.7', 'monthly'),
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
