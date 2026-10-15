// Adds the address-bearing tags (canonical link, link preview image and
// address) to the hosted convert page. The page itself is built without them
// so it carries no domain, and the site address is read from the site config.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = process.argv[2];
if (!page) {
  console.error('usage: node add-convert-meta.mjs <convert page>');
  process.exit(1);
}

const config = readFileSync(
  fileURLToPath(new URL('../astro.config.mjs', import.meta.url)),
  'utf8',
);
const site = /const site = '([^']+)'/.exec(config)?.[1];
if (!site) {
  console.error('could not read the site address from astro.config.mjs');
  process.exit(1);
}

const tags = [
  `<link rel="canonical" href="${site}/convert/">`,
  `<meta property="og:url" content="${site}/convert/">`,
  `<meta property="og:image" content="${site}/og-image.png">`,
].join('\n');

const html = readFileSync(page, 'utf8');
if (html.includes('rel="canonical"')) {
  process.exit(0);
}
writeFileSync(page, html.replace('<style>', () => `${tags}\n<style>`));
