import { mkdir, copyFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Keep this allowlist explicit: never publish database, secrets, tests or server code.
const staticFiles = [
  'index.html',
  'styles.css',
  'module-workspace.css',
  'business-lines-theme.css',
  'auth.css',
  'satguru-brand.css',
  'workspace-shell.css',
  'workspace-shell.js',
  'module-header.js',
  'module-header.css',
  'app.js',
  'responsive.js',
  'auth.js',
  'module-workspace.js',
  'business-lines-ui.js',
  'country-ui.js',
  'region-ui.js',
  'branch-master-ui.js',
  'department-master-ui.js',
  'department-master.css',
  'department-master-parity.css',
  'department-layout.css',
  'records-tools.js',
  'records-tools.css',
  'round-10-enhancements.css',
  'round-10-enhancements.js'
];
const binaryAssets = ['assets/satguru-travel-logo.webp'];
await mkdir('public/assets', { recursive: true });
for (const file of [...staticFiles, ...binaryAssets]) {
  await copyFile(file, join('public', file));
}

// Regression protection: all relative assets referenced by index must be in Vercel output.
const html = await readFile('public/index.html', 'utf8');
const referenced = [...html.matchAll(/\b(?:href|src)="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map(match => match[1]);
for (const file of referenced) {
  const details = await stat(join('public', file));
  if (!details.isFile() || details.size === 0) throw Error('Missing/empty published asset: ' + file);
}
const logo = await readFile('public/assets/satguru-travel-logo.webp');
if (logo.length < 100 || logo.toString('ascii', 0, 4) !== 'RIFF' || logo.toString('ascii', 8, 12) !== 'WEBP') {
  throw Error('Satguru logo is not a valid WebP asset');
}
console.log('Built CRM assets with official Satguru logo and brand styles; server files excluded');
