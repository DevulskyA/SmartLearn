#!/usr/bin/env node
// Compares the computed style of every distinct element kind of one screen: V7.2 reference file x the running app.
// Read-only: opens the reference from disk and the app on a LOCAL preview (127.0.0.1) and signs in through the login form.
// Usage: node scripts/style-diff-v72.mjs --screen stats --app http://127.0.0.1:5190 [--widths 897,1440] [--out file.json]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { DEV_ACCOUNT } from './seed-dev.mjs';

const args = { screen: 'stats', app: 'http://127.0.0.1:5190', widths: '897,1440', out: '', shots: '' };
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(args.app)) throw new Error('only a local preview is allowed');

const REFERENCE = pathToFileURL(resolve('tools/paridade-v72-kit/reference/V7.2.html')).href;
const PROPS = ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'borderTopWidth', 'borderTopColor', 'borderLeftWidth', 'borderLeftColor',
  'borderRadius', 'display', 'gap', 'boxShadow', 'opacity'];

// Runs in the page: one record per distinct element kind (tag + classes, or tag inside its parent's class) of the screen.
const collect = ({ screen, props }) => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (value) => {
    if (!/^(rgb|oklch|color|#|hsl)/.test(value)) return value;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0]},${d[1]},${d[2]},${(d[3] / 255).toFixed(2)})`;
  };
  const colourProps = new Set(['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']);
  const elementKey = (element) => {
    const classes = [...element.classList].filter((className) => !/^is-|^js-/.test(className)).sort();
    for (const attr of ['data-band', 'data-trend', 'data-state', 'data-direction']) {
      if (element.getAttribute(attr)) classes.push('[' + attr + '=' + element.getAttribute(attr) + ']');
    }
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement ? [...element.parentElement.classList].sort().join('.') : '';
    const parentName = parent || element.parentElement?.tagName.toLowerCase();
    return classes.length ? tag + '.' + classes.join('.') : tag + ' in .' + parentName;
  };
  const styleRecord = (element, box, rootBox, style) => {
    const record = { count: 1, text: (element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), x: Math.round(box.x - rootBox.x), width: Math.round(box.width), height: Math.round(box.height) };
    for (const prop of props) record[prop] = colourProps.has(prop) ? rgba(style[prop]) : style[prop];
    record.fontFamily = String(record.fontFamily).split(',')[0].replace(/["']/g, '').trim();
    return record;
  };
  const root = document.querySelector(`#screen-${screen}`);
  if (!root) return null;
  const rootBox = root.getBoundingClientRect();
  const records = {};
  for (const element of root.querySelectorAll('*')) {
    if (element.closest('svg') && element.tagName.toLowerCase() !== 'svg') continue;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width < 1 || box.height < 1 || style.visibility === 'hidden' || style.display === 'none') continue;
    const key = elementKey(element);
    if (records[key]) { records[key].count += 1; continue; }
    records[key] = styleRecord(element, box, rootBox, style);
  }
  return records;
};

const browser = await chromium.launch({ headless: true });
const report = {};
for (const width of args.widths.split(',').map(Number)) {
  const open = async (url) => {
    const page = await (await browser.newContext({ viewport: { width, height: args.shots ? 3600 : 900 }, reducedMotion: 'reduce' })).newPage();
    await page.goto(url);
    return page;
  };
  const ref = await open(REFERENCE);
  await ref.click(`[data-screen="${args.screen}"]`);
  await ref.waitForTimeout(600);
  const app = await open(args.app);
  if (await app.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    await app.locator('input[type="email"]').first().fill(DEV_ACCOUNT.email);
    await app.locator('input[type="password"]').first().fill(DEV_ACCOUNT.password);
    await app.locator('input[type="password"]').first().press('Enter');
    await app.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 15000 });
  }
  await app.click(`[data-screen="${args.screen}"]`);
  await app.waitForSelector(`#screen-${args.screen}:not([hidden])`, { timeout: 15000 });
  await app.waitForTimeout(1500);
  if (args.shots) {
    await ref.locator(`#screen-${args.screen}`).screenshot({ path: `${args.shots}/ref-${args.screen}-${width}.png` });
    await app.locator(`#screen-${args.screen}`).screenshot({ path: `${args.shots}/app-${args.screen}-${width}.png` });
  }
  const a = await ref.evaluate(collect, { screen: args.screen, props: PROPS });
  const b = await app.evaluate(collect, { screen: args.screen, props: PROPS });
  if (!a || !b) throw new Error(`screen-${args.screen} not found (reference ${Boolean(a)}, app ${Boolean(b)})`);
  const out = { missingInApp: [], extraInApp: [], different: {} };
  for (const key of Object.keys(a)) {
    if (!b[key]) { out.missingInApp.push(`${key}  "${a[key].text}"`); continue; }
    const diffs = {};
    for (const p of [...PROPS, 'x', 'width', 'height']) if (String(a[key][p]) !== String(b[key][p]) && !(p === 'lineHeight' && (a[key][p] === 'normal' || b[key][p] === 'normal'))) diffs[p] = `${a[key][p]}  ->  ${b[key][p]}`;
    if (Object.keys(diffs).length) out.different[key] = diffs;
  }
  for (const key of Object.keys(b)) if (!a[key]) out.extraInApp.push(`${key}  "${b[key].text}"`);
  report[width] = out;
  await ref.context().close();
  await app.context().close();
}
await browser.close();

const formatDifferences = (diffs) => Object.entries(diffs).map(([property, value]) => '      ' + property + ': ' + value).join('\n');

for (const [width, r] of Object.entries(report)) {
  console.log(`\n=== ${width}px  missing in app: ${r.missingInApp.length} | extra in app: ${r.extraInApp.length} | kinds with style differences: ${Object.keys(r.different).length}`);
  for (const m of r.missingInApp) console.log(`  MISSING  ${m}`);
  for (const m of r.extraInApp) console.log(`  EXTRA    ${m}`);
  for (const [key, diffs] of Object.entries(r.different)) console.log(`  DIFF ${key}\n${formatDifferences(diffs)}`);
}
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
