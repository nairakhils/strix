import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const candidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function chromeOptions() {
  const executablePath = process.env.STRIX_CHROME ?? candidates.find((path) => existsSync(path));
  if (!executablePath) throw new Error('Google Chrome not found; set STRIX_CHROME to its executable');
  const graphics = process.platform === 'darwin' ? ['--use-angle=metal'] : [];
  return {
    executablePath,
    headless: true,
    args: [...graphics, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  };
}

export function launch() {
  return chromium.launch(chromeOptions());
}

export async function openRecorder(browser, base, { width, height }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const failed = new Promise((_, reject) => {
    page.on('pageerror', reject);
    page.on('console', (message) => {
      if (message.type() === 'error') reject(new Error(message.text()));
    });
  });
  failed.catch(() => {});
  const guard = (work) => Promise.race([work, failed]);
  const query = new URLSearchParams({ width: String(width), height: String(height) });
  await guard(page.goto(`${base}/?record&${query}`));
  await guard(page.waitForFunction(() => window.strix || window.strixError, null, { timeout: 120000 }));
  const error = await page.evaluate(() => window.strixError);
  if (error) throw new Error(error);
  const info = await page.evaluate(() => window.strix.info);
  return { page, guard, info };
}
