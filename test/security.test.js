import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const jsFiles = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
const htmlFiles = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.html'));

const FORBIDDEN_JS = [
  [/storage\.sync/, 'storage.sync (would sync user data to Google)'],
  [/chrome\.cookies/, 'chrome.cookies (must never touch cookies)'],
  [/api\/(save|vote|comment|submit|publish|message|read_message|friend|compose|del)\b/, 'Reddit write API'],
  [/\.innerHTML\s*=/, 'innerHTML assignment'],
  [/\.outerHTML\s*=/, 'outerHTML assignment'],
  [/document\.write\s*\(/, 'document.write'],
  [/\beval\s*\(/, 'eval'],
  [/new Function\s*\(/, 'new Function'],
  [/setInterval\s*\(/, 'setInterval (background polling is forbidden)'],
  [/chrome\.alarms/, 'chrome.alarms (scheduled fetching is forbidden)'],
  [/chrome\.tabs\.executeScript/, 'legacy executeScript'],
  [/scripting\.executeScript\(\s*\{[^}]*world\s*:\s*['"]MAIN/, 'MAIN world injection'],
];

test('no forbidden APIs or write calls anywhere in src/', () => {
  const violations = [];
  for (const file of jsFiles) {
    const code = readFileSync(file, 'utf8');
    for (const [pattern, label] of FORBIDDEN_JS) {
      if (pattern.test(code)) violations.push(`${file.replace(ROOT + '/', '')}: ${label} (${pattern})`);
    }
  }
  assert.deepEqual(violations, []);
});

test('manifest is minimal: no host access, no content scripts, exact permissions', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.oauth2, undefined);
  assert.equal(manifest.background.type, 'module');
  for (const path of [
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ]) {
    assert.ok(existsSync(join(ROOT, path)), `manifest references missing file: ${path}`);
  }
});

test('popup.html has no inline scripts and no remote resources', () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc\s*=)/i.test(html), `${file}: inline script tag`);
    assert.ok(!/<(?:src|href)\s*=\s*["']https?:\/\//i.test(html), `${file}: remote src/href`);
    assert.ok(!/javascript:/i.test(html), `${file}: javascript: URL`);
  }
});

test('background wires the content script path and the file exists', () => {
  const bg = readFileSync(join(ROOT, 'src/background.js'), 'utf8');
  assert.ok(bg.includes("files: ['src/content/fetcher.js']"));
  assert.ok(existsSync(join(ROOT, 'src/content/fetcher.js')));
  assert.ok(bg.includes('SRR_START_FETCH'));
  assert.ok(bg.includes('SRR_OPEN_SUBMIT'));
});

test('submit URLs opened by the background are restricted to reddit.com', () => {
  const bg = readFileSync(join(ROOT, 'src/background.js'), 'utf8');
  assert.ok(bg.includes("msg.url.startsWith('https://www.reddit.com/')"));
});

test('fetcher only requests read-only reddit endpoints', () => {
  const code = readFileSync(join(ROOT, 'src/content/fetcher.js'), 'utf8');
  const endpoints = [...code.matchAll(/['"](\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(endpoints.length > 0);
  for (const ep of endpoints) {
    assert.ok(
      ep.startsWith('/api/me.json') || ep.startsWith('/saved.json'),
      `unexpected endpoint: ${ep}`,
    );
  }
});
