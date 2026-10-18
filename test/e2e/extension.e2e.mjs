import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

// This file lives at test/e2e/, so the extension root (where manifest.json
// lives) is two levels up. Loading test/ itself was a historic bug that made
// this test time out waiting for a service worker that could never start.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT_PATH = ROOT;

// Branded Google Chrome >= 137 silently ignores --load-extension, which kills
// this test. Prefer an explicit override, then a Playwright-managed Chromium
// build if it is actually on disk, then the newest cached one, then system Chrome.
function resolveChrome() {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  try {
    const registryPath = chromium.executablePath();
    if (registryPath && existsSync(registryPath)) return registryPath;
  } catch (_e) {
    /* fall through */
  }
  const cacheDir = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const candidates = readdirSync(cacheDir)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)));
    for (const dirName of candidates) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(cacheDir, dirName, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return '/usr/bin/google-chrome';
}

// Extensions need launchPersistentContext: the MV3 service worker starts at
// browser launch, before any context exists, so a waitForEvent on a freshly
// created context can miss it entirely.
async function launch(contextOpts = {}) {
  const { args: extraArgs, ...opts } = contextOpts;
  const profileDir = mkdtempSync(join(tmpdir(), 'srr-ext-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: resolveChrome(),
    headless: false,
    timeout: 60000,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions-except=' + EXT_PATH,
      '--load-extension=' + EXT_PATH,
      ...(extraArgs || []),
    ],
    ...opts,
  });
  return { context, profileDir };
}

async function getExtensionId(context) {
  let [background] = context.serviceWorkers();
  if (!background) {
    try {
      background = await context.waitForEvent('serviceworker', { timeout: 15000 });
    } catch (_e) {
      background = null;
    }
  }
  if (background) {
    const m = background.url().match(/^chrome-extension:\/\/([^/]+)/);
    if (m) return m[1];
  }
  // fallback: open chrome://extensions and read id
  const page = await context.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  const id = await page.evaluate(() => {
    const els = document.querySelectorAll('extensions-item');
    for (const el of els) {
      const name = el.shadowRoot?.querySelector('#name')?.textContent || '';
      if (name.includes('Saved Repost Recommender')) {
        return el.id || '';
      }
    }
    return '';
  });
  await page.close();
  return id;
}

test('extension loads and popup shows guidance when not on reddit', async () => {
  const { context, profileDir } = await launch();
  try {
    const id = await getExtensionId(context);
    assert.ok(id, 'extension id found');
    const page = await context.newPage();
    await page.goto('about:blank');
    await page.goto(`chrome-extension://${id}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    const text = await page.textContent('body');
    assert.ok(text.includes('Open reddit.com'), 'shows guidance');
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
