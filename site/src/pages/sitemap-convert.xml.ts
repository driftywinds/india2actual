import type { APIRoute } from 'astro';

// The Convert page is built outside Astro, so the generated sitemap does not list it.
export const GET: APIRoute = ({ site }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${new URL('convert/', site)}</loc></url></urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
