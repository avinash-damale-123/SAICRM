import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';

test('Vercel build publishes logo and every linked brand stylesheet', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
  for (const name of ['satguru-brand.css', 'business-lines-theme.css', 'assets/satguru-travel-logo.webp']) {
    const file = await stat('public/' + name);
    assert.ok(file.isFile() && file.size > 100, 'static output missing ' + name);
  }
  const css = await readFile('public/satguru-brand.css', 'utf8');
  assert.match(css, /#087b40/i, 'Satguru green token missing');
  assert.match(css, /#ed8528/i, 'Satguru orange token missing');
  assert.match(css, /nav-item\.active/, 'selected sidebar branding missing');
  const bytes = await readFile('public/assets/satguru-travel-logo.webp');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  const markup = await readFile('public/index.html','utf8');
  assert.match(markup,/assets\/satguru-travel-logo\.webp/);
});
