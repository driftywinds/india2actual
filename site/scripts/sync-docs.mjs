import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { renderChangelog, renderReadme } from './sync-docs-lib.mjs';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const pages = [
  ['../../README.md', '../src/content/docs/docs.md', renderReadme],
  ['../../CHANGELOG.md', '../src/content/docs/changelog.md', renderChangelog],
];

for (const [source, target, render] of pages) {
  const output = render(await readFile(path(source), 'utf8'));
  await writeFile(path(target), output);
  console.log(`Rendered ${source.replace('../../', '')} to ${target.replace('../', '')}`);
}

// The wordmark font lives with the browser pages, which inline it. The site
// serves its own copy, so no page asks another host for it.
await copyFile(path('../../web/fonts/wordmark.woff2'), path('../public/wordmark.woff2'));
