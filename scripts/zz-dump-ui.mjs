// Lists stable selectors (id, data-action, data-screen, name) visible on each screen of the running isolated app. Exploration helper.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import('@playwright/test');
const st = JSON.parse(readFileSync(join(tmpdir(), 'sl-ui-driver-state.json'), 'utf8'));
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${st.cdp}`);
const page = browser.contexts()[0].pages()[0];
for (const s of (process.argv[2] ?? 'today,materials,plan,stats,settings,account').split(',')) {
  await page.locator(`[data-screen="${s}"]:visible`).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const out = await page.evaluate(() => [...document.querySelectorAll('button,input,select,textarea,a[href],[data-action]')].filter((e) => e.getClientRects().length).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.dataset.action ? '[action=' + e.dataset.action + ']' : ''}${e.dataset.screen ? '[screen=' + e.dataset.screen + ']' : ''} ${(e.innerText || e.placeholder || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40)}`));
  console.log(`=== ${s}\n${out.join('\n')}`);
}
await browser.close().catch(() => {});
process.exit(0);
