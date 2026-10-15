// Builds the browser converter into self-contained HTML files.
//
// Everything (code, styles, the PDF reader and its worker) is inlined, so the
// page needs no network. The Content-Security-Policy is written from hashes of
// that exact code. The convert page forbids every request, which is what lets
// it promise that a statement never leaves the browser. The push page also
// carries the Actual API and may reach an https server, or one on this
// computer, and nothing else.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildCss,
  buildWorker,
  bundleApp,
  hash,
  root,
} from './web-shared.mjs';

const outDir = resolve(root, 'dist-web');
const worker = await buildWorker();
const css = await buildCss();

// What a search engine or a link preview shows for the hosted convert page.
const convertTitle = 'Convert Indian bank statements for Actual Budget | india2actual';
const convertDescription =
  'Drop an Indian bank or credit card statement (PDF, CSV or Excel) and download a file Actual Budget can import, with real payee names. It runs in your browser and nothing is uploaded.';
const convertHead = [
  `<meta name="description" content="${convertDescription}">`,
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="india2actual">',
  `<meta property="og:title" content="${convertTitle}">`,
  `<meta property="og:description" content="${convertDescription}">`,
  '<meta name="twitter:card" content="summary_large_image">',
].join('\n');

const variants = [
  {
    file: 'india2actual-convert.html',
    title: convertTitle,
    head: `\n${convertHead}`,
    push: false,
    policy: js => [
      "default-src 'none'",
      `script-src ${hash(js)}`,
      `style-src ${hash(css)}`,
      // PDF.js starts its reader from a Blob.
      'worker-src blob:',
      // The page's own icon, written into it as a data URI.
      'img-src data:',
      'font-src data:',
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
    ],
  },
  {
    file: 'india2actual.html',
    title: 'india2actual',
    head: '',
    push: true,
    policy: js => [
      "default-src 'none'",
      // The Actual API runs SQLite compiled to WebAssembly.
      `script-src ${hash(js)} 'wasm-unsafe-eval'`,
      `style-src ${hash(css)}`,
      'worker-src blob:',
      // The page's own icon, written into it as a data URI.
      'img-src data:',
      'font-src data:',
      // An https server, or one on this computer. Actual needs the same.
      'connect-src https: http://localhost:* http://127.0.0.1:* http://[::1]:*',
      "form-action 'none'",
      "base-uri 'none'",
    ],
  },
];

mkdirSync(outDir, { recursive: true });
const sums = [];

for (const variant of variants) {
  // A closing script tag inside the code would end the inline script early.
  const js = (await bundleApp({ push: variant.push, worker })).replaceAll(
    '</script',
    '<\\/script',
  );

  const html = readFileSync(resolve(root, 'web/index.template.html'), 'utf8')
    .replace('__CSP__', variant.policy(js).join('; '))
    .replace('__TITLE__', variant.title)
    .replace('__HEAD__', () => variant.head)
    .replace('__CSS__', () => css)
    .replace('__JS__', () => js);

  writeFileSync(resolve(outDir, variant.file), html);
  const sha = createHash('sha256').update(html).digest('hex');
  sums.push(`${sha}  ${variant.file}`);
  console.log(`${variant.file}: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
}

writeFileSync(resolve(outDir, 'SHA256SUMS'), `${sums.join('\n')}\n`);
console.log(sums.join('\n'));
