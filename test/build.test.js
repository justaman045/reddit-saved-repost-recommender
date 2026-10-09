import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function exists(rel) {
  return existsSync(join(ROOT, rel));
}

test('build artifacts exist and are parseable', () => {
  assert.ok(exists('manifest.json'));
  assert.ok(exists('icons/icon16.png'));
  assert.ok(exists('icons/icon48.png'));
  assert.ok(exists('icons/icon128.png'));
  assert.ok(exists('src/background.js'));
  assert.ok(exists('src/content/fetcher.js'));
  assert.ok(exists('src/popup/popup.html'));
  assert.ok(exists('src/popup/popup.css'));
  assert.ok(exists('src/popup/popup.js'));
  assert.ok(exists('test/fixtures/saved-synthetic.json'));

  JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  JSON.parse(readFileSync(join(ROOT, 'test/fixtures/saved-synthetic.json'), 'utf8'));

  const bg = readFileSync(join(ROOT, 'src/background.js'), 'utf8');
  assert.ok(bg.includes('SRR_START_FETCH'));

  const fetcher = readFileSync(join(ROOT, 'src/content/fetcher.js'), 'utf8');
  assert.ok(fetcher.includes('SRR_FETCH'));
  assert.ok(fetcher.includes('/saved.json'));
  assert.ok(fetcher.includes('/api/me.json'));
});
