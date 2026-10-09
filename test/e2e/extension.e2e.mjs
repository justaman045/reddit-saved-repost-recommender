import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT_PATH = ROOT;
const CHROME_PATH = process.env.CHROME_EXECUTABLE || '/usr/bin/google-chrome';

async function launch(contextOpts = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || '/usr/bin/google-chrome',
    headless: false,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions-except=' + EXT_PATH,
      '--load-extension=' + EXT_PATH,
    ],
  });
  const context = await browser.newContext({
    ...contextOpts,
  });
  return { browser, context };
}

async function getExtensionId(context) {
  let [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent('serviceworker');
  const url = background.url();
  const m = url.match(/^chrome-extension:\/\/([^/]+)/);
  if (m) return m[1];
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
  const { browser, context } = await launch();
  try {
    const id = await getExtensionId(context);
    assert.ok(id, 'extension id found');
    const page = await context.newPage();
    await page.goto('about:blank');
    await page.goto(`chrome-extension://${id}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    const text = await page.textContent('body');
    assert.ok(text.includes('Open reddit.com'), 'shows guidance');
  } finally {
    await browser.close();
  }
});
