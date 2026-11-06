// Auditoria de telas (somente leitura do produto): servidor + Vite DESCARTAVEIS, banco temporario, seed de desenvolvimento.
// Nunca toca em C:/Users/Ariel/SmartLearn-DevData. Uso (a partir da raiz do repositorio):
//   node .specs/evidence/auditoria-telas-restantes-2026-11-02/ferramenta/audit-live.mjs <pastaDeSaida> <modo>
// modos: hoje390 | varredura390 | comportamento | build
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { seedDev, DEV_ACCOUNT } from '../../../../scripts/seed-dev.mjs';
import { buildFixturePdf } from '../../../../server/test/pdf-fixtures/build-fixture-pdf.js';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const out = resolve(process.argv[2]);
const mode = process.argv[3] ?? 'build';
mkdirSync(out, { recursive: true });
const freePort = () => new Promise((ok, fail) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on('error', fail); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'sl-audit-'));
const serverPort = await freePort();
const vitePort = await freePort();
const origin = `http://localhost:${vitePort}`;
const api = `http://localhost:${serverPort}`;
const procs = [];
const report = { mode, root, started: new Date().toISOString(), notes: [] };
const t0 = Date.now();
const note = (s) => { report.notes.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`); };

const PAGE_1 = 'Filtração glomerular. A filtração glomerular é determinada pelo balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica capilar de 32 mmHg com a pressão hidrostática da cápsula de Bowman de 18 mmHg, que se opõem. A pressão efetiva de filtração resulta em 10 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min.';
const PAGE_2 = 'Regulação da filtração. A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular quando a perfusão renal cai.';

// ---- sondas executadas dentro da pagina ----
const sweepFn = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (e) => (e.innerText || e.getAttribute('aria-label') || e.value || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 44);
  const ctrls = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]')].filter(vis);
  const rows = ctrls.map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), text: label(e), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY) }; });
  const small24 = rows.filter((x) => x.w < 24 || x.h < 24);
  const small44 = rows.filter((x) => (x.w < 44 || x.h < 44));
  const tiny = [];
  for (const e of document.querySelectorAll('main *, nav *, header *')) {
    if (!vis(e) || !e.childNodes.length) continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 12) tiny.push({ text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), px: +fs.toFixed(1) });
  }
  const clipped = [];
  for (const e of document.querySelectorAll('main *')) {
    if (!vis(e)) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && /(hidden|clip)/.test(cs.overflowX) && e.clientWidth > 0 && (e.innerText || '').trim()) clipped.push({ cls: String(e.className).slice(0, 40), text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 44), sw: e.scrollWidth, cw: e.clientWidth });
  }
  const over = [];
  for (const e of document.querySelectorAll('main *')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1) over.push({ cls: String(e.className).slice(0, 40), text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), right: Math.round(r.right) }); }
  const scrollers = [...document.querySelectorAll('main *')].filter((e) => vis(e) && /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1).map((e) => ({ cls: String(e.className).slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth }));
  return { vw: innerWidth, docScrollW: document.documentElement.scrollWidth, controls: rows.length, small24: small24.length, small44: small44.length, small24Examples: small24.slice(0, 12), small44Examples: small44.slice(0, 16), tinyCount: tiny.length, tinyExamples: tiny.slice(0, 8), clippedCount: clipped.length, clippedExamples: clipped.slice(0, 10), overflowRight: over.slice(0, 8), hScrollers: scrollers };
};

try {
  procs.push(spawn(process.execPath, [join(root, 'server/src/main.js')], { env: { ...process.env, SMARTLEARN_DB_PATH: join(work, 'a.db'), SMARTLEARN_SOURCES_DIR: join(work, 'sources'), PORT: String(serverPort), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: origin }, stdio: 'ignore' }));
  procs.push(spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' }));
  for (let i = 0; i < 150; i += 1) { try { if ((await fetch(`${api}/health/ready`)).status === 200 && (await fetch(origin)).ok) break; } catch { /* not yet */ } await sleep(200); }
  note('servidor + vite prontos');
  report.seed = await seedDev({ base: api, origin });
  note('seed ok');
  const browser = await chromium.launch();
  const initScript = (base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; try { localStorage.setItem('smartlearn.summary-mode', 'visual'); } catch { /* sem storage */ } };
  const newSession = async ({ width, height, mobile = false, permissions = [] }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, permissions });
    await ctx.addInitScript(initScript, api);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`.slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`.slice(0, 200)));
    await page.goto(origin);
    await page.waitForFunction(() => window.location.hash.length > 1, undefined, { timeout: 10000 });
    await page.locator('[data-screen="account"]:visible').first().click();
    await page.locator('#account-login-email').fill(DEV_ACCOUNT.email);
    await page.locator('#account-login-password').fill(DEV_ACCOUNT.password);
    await page.locator('#account-login-form button[type="submit"]').click();
    await page.locator('#account-logged-in-view').waitFor({ state: 'visible', timeout: 8000 });
    return { ctx, page, errors };
  };
  const go = async (page, screen) => { await page.locator(`[data-screen="${screen}"]:visible`).first().click(); await sleep(900); };
  const scenarioErrors = [];
  const scenario = async (name, fn) => { try { await fn(); note(`ok ${name}`); } catch (err) { scenarioErrors.push(`${name}: ${String(err.message).split('\n')[0]}`); note(`FALHOU ${name}`); } };
  report.scenarioErrors = scenarioErrors;

  // ------------------------------------------------------------------------------------------------
  if (mode === 'build') {
    const { ctx, page } = await newSession({ width: 1280, height: 900 });
    await go(page, 'stats');
    report.build = await page.evaluate(() => ({ footer: document.querySelector('.build-identity, [data-build-identity], footer')?.innerText ?? null, statsText: document.querySelector('[data-screen-panel="stats"]')?.innerText.replace(/\s+/g, ' ').slice(0, 900) }));
    await page.screenshot({ path: join(out, '1280-estatisticas-build-base.png'), fullPage: true });
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------
  if (mode === 'telas') {
    // recaptura, NA BASE auditada, das telas das 6 familias (1280 e 390), com fatias de 1000 px para as altas
    for (const width of [1280, 390]) {
      const mobile = width < 600;
      const { ctx, page } = await newSession({ width, height: mobile ? 844 : 900, mobile });
      const shot = async (name, { maxHeight = 7000 } = {}) => {
        const minHeight = mobile ? 844 : 900;
        await page.setViewportSize({ width, height: minHeight }); await sleep(400);
        const needed = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight).map((e) => e.getBoundingClientRect().top + e.scrollHeight)));
        const height = Math.min(Math.max(minHeight, Math.ceil(needed) + 20), maxHeight);
        await page.setViewportSize({ width, height }); await sleep(350);
        await page.screenshot({ path: join(out, `${width}-${name}.png`) });
        if (height > 1200) for (let i = 0, y = 0; y < height; i += 1, y += 1000) await page.screenshot({ path: join(out, `${width}-${name}-p${i + 1}.png`), clip: { x: 0, y, width, height: Math.min(1000, height - y) } });
        report.shots = [...(report.shots ?? []), `${width}-${name} ${width}x${height}`];
        await page.setViewportSize({ width, height: minHeight });
      };
      await scenario(`telas-${width}-plano`, async () => {
        await go(page, 'plan'); await shot('plano');
        await page.getByRole('button', { name: 'Expandir detalhes' }).first().click(); await sleep(500); await shot('plano-expandido', { maxHeight: 2600 });
        await go(page, 'plan'); await page.locator('#plan-manage-subjects-btn').click(); await sleep(500); await shot('plano-disciplinas', { maxHeight: 3000 });
        await page.locator('#plan-manage-subjects-btn').click(); await sleep(300);
        await page.locator('#plan-new-unit-btn').click(); await sleep(500); await shot('plano-nova-aula', { maxHeight: 2600 });
        await page.locator('#plan-unit-cancel-btn').click(); await sleep(300);
      });
      await scenario(`telas-${width}-stats`, async () => {
        await go(page, 'stats'); await shot('estatisticas');
        await page.locator('#stats-unit-filter-period').selectOption(''); await sleep(700); await shot('estatisticas-qualquer-periodo');
        await page.locator('#stats-unit-filter-period').selectOption('last-90'); await sleep(500);
        await page.locator('#tab-stats-unit').click(); await sleep(700); await shot('estatisticas-por-conteudo');
      });
      await scenario(`telas-${width}-config`, async () => { await go(page, 'settings'); await shot('configuracoes'); });
      await scenario(`telas-${width}-conta`, async () => { await go(page, 'account'); await shot('conta'); await page.locator('#account-password-details summary').click(); await sleep(400); await shot('conta-alterar-senha'); });
      await scenario(`telas-${width}-materiais`, async () => {
        await go(page, 'materials'); await shot('materiais');
        await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([PAGE_1, PAGE_2]) });
        await page.locator('#sources-message').filter({ hasText: /trechos? propostos?/ }).waitFor({ timeout: 15000 });
        await sleep(500); await shot('materiais-propostas');
        await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
        await page.locator('.lesson-editor').waitFor({ state: 'visible', timeout: 25000 });
        for (const tab of ['Resumo', 'Questões', 'Fonte', 'Revisão']) { await page.locator('.lesson-editor').getByRole('tab', { name: new RegExp(tab) }).click(); await sleep(600); await shot(`editor-${tab.toLowerCase().replace('õ', 'o').replace('ã', 'a')}`, { maxHeight: 3200 }); }
      });
      await ctx.close();
    }
  }

  // ------------------------------------------------------------------------------------------------
  if (mode === 'hoje390') {
    const { ctx, page, errors } = await newSession({ width: 390, height: 844, mobile: true });
    await go(page, 'today');
    await sleep(1200);
    const geo = await page.evaluate(() => {
      const nav = [...document.querySelectorAll('nav')].filter((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.position === 'fixed' && r.top > innerHeight / 2; })[0];
      const se = document.scrollingElement;
      const inner = [...document.querySelectorAll('main, .app-shell, .screen, body > *')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2).map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 40), sh: e.scrollHeight, ch: e.clientHeight }));
      return { innerHeight, docScrollHeight: se.scrollHeight, innerScrollers: inner, navRect: nav ? (({ top, height }) => ({ top: Math.round(top), height: Math.round(height) }))(nav.getBoundingClientRect()) : null, navPos: nav ? getComputedStyle(nav).position : null, reviewCards: document.querySelectorAll('[data-screen-panel="today"] .review-card, [data-screen-panel="today"] .review-group, [data-screen-panel="today"] article').length };
    });
    report.hoje390 = { geo };
    // rolagem real, em passos, ate o fim
    // o app rola DENTRO de main.app-main (o documento nao rola): a roda do mouse e o gesto real
    for (let i = 0; i < 120; i += 1) { await page.mouse.move(200, 400); await page.mouse.wheel(0, 700); await sleep(60); const done = await page.evaluate(() => { const m = document.querySelector('main.app-main'); return Math.abs((m.scrollTop + m.clientHeight) - m.scrollHeight) < 2; }); if (done) { report.hoje390.wheelSteps = i + 1; break; } }
    await sleep(400);
    await page.screenshot({ path: join(out, '390-hoje-fim-da-rolagem.png') });
    report.hoje390.end = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const nav = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().top > innerHeight / 2);
      const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
      const panel = document.querySelector('[data-screen-panel="today"]');
      const ctrls = [...panel.querySelectorAll('a[href], button, input, select, textarea, summary')].filter(vis);
      const last = ctrls.slice(-6).map((e) => { const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = Math.min(r.top + r.height / 2, innerHeight - 1); const hit = document.elementFromPoint(cx, cy); return { text: (e.innerText || e.getAttribute('aria-label') || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), aboveNav: r.bottom <= navTop + 0.5, hitIsControl: !!hit && (hit === e || e.contains(hit)), hitIs: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}` : null }; });
      const lastEl = ctrls[ctrls.length - 1];
      const allText = [...panel.querySelectorAll('*')].filter(vis).filter((e) => (e.innerText || '').trim() && e.children.length === 0).slice(-3).map((e) => ({ text: e.innerText.trim().slice(0, 60), bottom: Math.round(e.getBoundingClientRect().bottom) }));
      return { scrollTop: Math.round(document.querySelector('main.app-main').scrollTop), scrollHeight: document.querySelector('main.app-main').scrollHeight, mainClientHeight: document.querySelector('main.app-main').clientHeight, scrollPaddingBottom: getComputedStyle(document.querySelector('main.app-main')).scrollPaddingBottom, navTop: Math.round(navTop), panelBottomPaddingPx: parseFloat(getComputedStyle(panel).paddingBottom), mainPaddingBottomPx: parseFloat(getComputedStyle(document.querySelector('main') ?? document.body).paddingBottom), lastControlsTail: last, lastLeafTextTail: allText, lastControlCount: ctrls.length, lastControlText: lastEl ? (lastEl.innerText || '').trim().slice(0, 40) : null };
    });
    // Tab de verdade ate o ultimo controle: o foco fica escondido sob a navegacao fixa?
    await page.evaluate(() => { document.querySelector('main.app-main').scrollTo(0, 0); document.activeElement?.blur(); });
    const lastIdx = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const panel = document.querySelector('[data-screen-panel="today"]');
      const ctrls = [...panel.querySelectorAll('a[href], button, input, select, textarea, summary')].filter(vis);
      ctrls[ctrls.length - 6].focus();
      return ctrls.length;
    });
    const focusTail = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab'); await sleep(250);
      if (i === 2 || i === 3) await page.screenshot({ path: join(out, `390-hoje-foco-por-tab-passo-${i + 1}.png`) });
      focusTail.push(await page.evaluate(() => {
        const e = document.activeElement; const r = e.getBoundingClientRect();
        const nav = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().top > innerHeight / 2);
        const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
        const inNav = !!nav && nav.contains(e);
        return { text: (e.innerText || e.getAttribute('aria-label') || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 34), inNav, top: Math.round(r.top), bottom: Math.round(r.bottom), navTop: Math.round(navTop), obscuredPx: inNav ? null : Math.max(0, Math.round(r.bottom - navTop)) };
      }));
    }
    report.hoje390.focusCtrlCount = lastIdx;
    report.hoje390.focusTail = focusTail;
    // o que existe abaixo do ultimo cartao: o fim do conteudo, de perto
    await page.evaluate(() => { const m = document.querySelector('main.app-main'); m.scrollTo(0, m.scrollHeight); }); await sleep(300);
    await page.screenshot({ path: join(out, '390-hoje-fim-da-rolagem-2.png') });
    // altura total e fatias de 1000 px da pagina inteira (so para localizar a regiao final)
    report.hoje390.errors = errors;
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------
  if (mode === 'varredura390') {
    const { ctx, page, errors } = await newSession({ width: 390, height: 844, mobile: true });
    report.sweep390 = {};
    for (const s of ['today', 'materials', 'plan', 'stats', 'settings', 'account']) { await go(page, s); report.sweep390[s] = await page.evaluate(sweepFn); }
    // a Hoje, ao fim da rolagem, e o Plano expandido
    await go(page, 'plan'); await page.getByRole('button', { name: 'Expandir detalhes' }).first().click(); await sleep(500);
    report.sweep390.planExpandido = await page.evaluate(sweepFn);
    await page.screenshot({ path: join(out, '390-plano-expandido-viewport.png') });
    await go(page, 'plan'); await page.locator('#plan-manage-subjects-btn').click(); await sleep(500);
    report.sweep390.planDisciplinas = await page.evaluate(sweepFn);
    await page.screenshot({ path: join(out, '390-plano-gerenciar-disciplinas.png'), fullPage: true });
    await go(page, 'plan'); await page.locator('#plan-new-unit-btn').click(); await sleep(500);
    report.sweep390.planNovaAula = await page.evaluate(sweepFn);
    await page.screenshot({ path: join(out, '390-plano-nova-aula.png'), fullPage: true });
    // Estatisticas: tabela, grafico e "por conteudo" em 390
    await go(page, 'stats');
    report.sweep390.statsTableScroll = await page.evaluate(() => { const t = document.querySelector('#view-stats-subject .table-scroll'); return t ? { sw: t.scrollWidth, cw: t.clientWidth, overflowX: getComputedStyle(t).overflowX } : null; });
    await page.screenshot({ path: join(out, '390-estatisticas-topo-viewport.png') });
    await page.locator('#tab-stats-unit').click(); await sleep(700);
    report.sweep390.statsPorConteudo = await page.evaluate(sweepFn);
    await page.screenshot({ path: join(out, '390-estatisticas-por-conteudo.png'), fullPage: true });
    // Materiais com o PDF aberto
    await go(page, 'materials');
    await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([PAGE_1, PAGE_2]) });
    await page.locator('#sources-message').filter({ hasText: /trechos? propostos?/ }).waitFor({ timeout: 15000 });
    await sleep(500);
    report.sweep390.materiaisPropostas = await page.evaluate(sweepFn);
    await page.screenshot({ path: join(out, '390-materiais-propostas.png'), fullPage: true });
    await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
    await page.locator('.lesson-editor').waitFor({ state: 'visible', timeout: 25000 });
    for (const tab of ['Resumo', 'Questões', 'Fonte', 'Revisão']) {
      await page.locator('.lesson-editor').getByRole('tab', { name: new RegExp(tab) }).click(); await sleep(600);
      report.sweep390[`editor-${tab}`] = await page.evaluate(sweepFn);
      await page.screenshot({ path: join(out, `390-editor-${tab.toLowerCase().replace('õ', 'o').replace('ã', 'a')}.png`), fullPage: true });
    }
    report.errors = errors;
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------
  if (mode === 'comportamento') {
    const { ctx, page, errors } = await newSession({ width: 1280, height: 900, permissions: ['clipboard-read', 'clipboard-write'] });
    report.beh = {};

    await scenario('plano-semantica-e-filtros', async () => {
      await go(page, 'plan');
      report.beh.planoChevrons = await page.evaluate(() => [...document.querySelectorAll('#plan-list button')].filter((b) => /Expandir/.test(b.getAttribute('aria-label') || b.innerText)).slice(0, 3).map((b) => ({ name: b.getAttribute('aria-label') || b.innerText.trim(), expanded: b.getAttribute('aria-expanded'), controls: b.getAttribute('aria-controls'), describedby: b.getAttribute('aria-describedby'), labelledby: b.getAttribute('aria-labelledby') })));
      report.beh.planoChevronNomesUnicos = await page.evaluate(() => { const n = [...document.querySelectorAll('#plan-list button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter((x) => /Expandir/.test(x)); return { total: n.length, distintos: new Set(n).size }; });
      report.beh.filtroEstadoOpcoes = await page.evaluate(() => [...document.querySelectorAll('#plan-filter-state option')].map((o) => ({ v: o.value, t: o.textContent.trim() })));
      report.beh.filtroPeriodoOpcoes = await page.evaluate(() => [...document.querySelectorAll('#plan-filter-period option')].map((o) => ({ v: o.value, t: o.textContent.trim() })));
      report.beh.ordenarOpcoes = await page.evaluate(() => [...document.querySelectorAll('#plan-sort option')].map((o) => ({ v: o.value, t: o.textContent.trim() })));
      const opts = report.beh.filtroEstadoOpcoes;
      report.beh.filtroEstadoResultados = [];
      for (const o of opts) {
        await page.locator('#plan-filter-state').selectOption(o.v); await sleep(400);
        report.beh.filtroEstadoResultados.push({ opcao: o.t, linhas: await page.locator('#plan-list > *').count(), vazio: await page.locator('#plan-empty').isVisible(), msgVazio: (await page.locator('#plan-empty').innerText()).slice(0, 120), titulos: await page.evaluate(() => [...document.querySelectorAll('#plan-list h3, #plan-list .plan-row-title, #plan-list [class*=title]')].slice(0, 12).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 3)) });
      }
      // o primeiro estado com resultado e a tela filtrada, fotografada na janela
      await page.locator('#plan-filter-state').selectOption(opts[1]?.v ?? ''); await sleep(500);
      await page.screenshot({ path: join(out, '1280-plano-filtro-de-estado-correto.png') });
      // combinacao sem resultado
      await page.locator('#plan-filter-subject').selectOption({ index: 1 }); await page.locator('#plan-filter-state').selectOption(opts[opts.length - 1]?.v ?? ''); await sleep(500);
      report.beh.filtroSemResultado = { vazioVisivel: await page.locator('#plan-empty').isVisible(), texto: (await page.locator('#plan-empty').innerText()).slice(0, 160), botaoNovaAulaNoVazio: await page.locator('#plan-empty-new').isVisible(), linhas: await page.locator('#plan-list > *').count() };
      await page.screenshot({ path: join(out, '1280-plano-filtro-sem-resultado.png') });
      await page.locator('#plan-filter-subject').selectOption(''); await page.locator('#plan-filter-state').selectOption('');
    });

    await scenario('plano-formulario', async () => {
      await go(page, 'plan');
      await page.locator('#plan-new-unit-btn').click(); await sleep(500);
      report.beh.novaAulaFoco = await page.evaluate(() => ({ id: document.activeElement?.id, tag: document.activeElement?.tagName }));
      report.beh.novaAulaCampos = await page.evaluate(() => [...document.querySelectorAll('#plan-new-unit-form input, #plan-new-unit-form select, #plan-new-unit-form textarea')].map((e) => ({ id: e.id, required: e.required, h: Math.round(e.getBoundingClientRect().height) })));
      await page.locator('#plan-unit-save-btn').click(); await sleep(500);
      report.beh.novaAulaVazioSalvar = { msg: (await page.locator('#plan-unit-form-message').innerText()).slice(0, 160), foco: await page.evaluate(() => document.activeElement?.id), validity: await page.evaluate(() => ({ title: document.querySelector('#plan-study-title')?.validity.valueMissing, subject: document.querySelector('#plan-subject-select')?.value })) };
      await page.screenshot({ path: join(out, '1280-plano-nova-aula-salvar-vazio.png') });
      // nova disciplina dentro do formulario: cor padrao
      await page.locator('#plan-show-subject-form').click(); await sleep(400);
      report.beh.novaDisciplinaCampos = await page.evaluate(() => { const slot = document.querySelector('#plan-new-subject-slot'); return { html: slot.innerHTML.replace(/\s+/g, ' ').slice(0, 1400), checked: [...slot.querySelectorAll('input:checked, [aria-checked=true], [aria-pressed=true]')].map((e) => e.value || e.getAttribute('aria-label') || e.className).slice(0, 3) }; });
      await page.screenshot({ path: join(out, '1280-plano-nova-disciplina-no-formulario.png') });
      await page.locator('#plan-unit-cancel-btn').click(); await sleep(300);
      // Gerenciar disciplinas: alternancia
      await page.locator('#plan-manage-subjects-btn').click(); await sleep(400);
      const abertoAntes = await page.locator('#plan-subjects-panel').isVisible();
      report.beh.gerenciarFoco = await page.evaluate(() => document.activeElement?.id);
      await page.locator('#plan-manage-subjects-btn').click(); await sleep(400);
      report.beh.gerenciarToggle = { aberto: abertoAntes, aposSegundoClique: await page.locator('#plan-subjects-panel').isVisible() };
    });

    await scenario('plano-pilulas-vs-estatisticas', async () => {
      await go(page, 'plan');
      const plano = await page.evaluate(() => [...document.querySelectorAll('#plan-list .performance-badge')].map((b) => ({ txt: b.textContent.trim(), perf: b.dataset.perf, bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color })));
      await go(page, 'stats');
      await page.locator('#stats-unit-filter-period').selectOption('');
      await sleep(900);
      const stats = await page.evaluate(() => [...document.querySelectorAll('.performance-badge')].filter((b) => b.offsetParent !== null).map((b) => ({ txt: b.textContent.trim(), perf: b.dataset.perf ?? null, cls: b.className, bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color })));
      report.beh.pilulas = { plano, statsAmostra: stats.slice(0, 40) };
    });

    await scenario('estatisticas', async () => {
      await go(page, 'stats'); await sleep(700);
      report.beh.statsEstruturaAtual = await page.evaluate(() => ({ kpis: [...document.querySelectorAll('.stats-kpi, [class*=kpi] dt')].map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)), periodoSelecionado: document.querySelector('#stats-unit-filter-period')?.value, periodoOpcoes: [...document.querySelectorAll('#stats-unit-filter-period option')].map((o) => o.textContent.trim()), lede: document.querySelector('.stats-lede')?.innerText ?? null, tabs: [...document.querySelectorAll('[role=tab]')].map((e) => e.innerText.trim()), headersTabela: [...document.querySelectorAll('#subject-kpi-head th')].map((e) => e.innerText.trim()) }));
      report.beh.statsGrafico = await page.evaluate(() => { const svg = document.querySelector('#view-stats-subject svg, .history-chart svg, svg.chart'); const sec = svg?.closest('section'); return { temSvg: !!svg, role: svg?.getAttribute('role') ?? null, ariaLabel: svg?.getAttribute('aria-label') ?? null, titleEl: svg?.querySelector('title')?.textContent ?? null, descEl: svg?.querySelector('desc')?.textContent ?? null, tabelaAlternativa: !!sec?.querySelector('table'), selects: [...(sec?.querySelectorAll('select') ?? [])].map((s) => ({ id: s.id, val: s.value, label: s.getAttribute('aria-label'), opts: [...s.options].map((o) => o.textContent.trim()) })) }; });
      report.beh.statsLogAviso = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="stats"] p, [data-screen-panel="stats"] .field-hint')].map((e) => e.innerText.trim()).filter((t) => /período|ignora|filtro/i.test(t)).slice(0, 4));
      // filtro de periodo muda o log?
      const contaLinhas = async () => page.locator('#stats-exercise-list tr, #stats-exercises tr, [data-screen-panel="stats"] table:last-of-type tbody tr').count();
      const antes = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="stats"] table')].map((t) => ({ cls: t.className, linhas: t.querySelectorAll('tbody tr').length })));
      await page.locator('#stats-unit-filter-period').selectOption('last-30'); await sleep(700);
      const depois30 = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="stats"] table')].map((t) => ({ cls: t.className, linhas: t.querySelectorAll('tbody tr').length })));
      report.beh.statsPeriodoVsLog = { qualquer: antes, ultimos30: depois30, kpisUltimos30: await page.evaluate(() => [...document.querySelectorAll('.stats-kpi')].map((e) => e.innerText.replace(/\s+/g, ' ').trim())) };
      await page.screenshot({ path: join(out, '1280-estatisticas-ultimos-30.png'), fullPage: true });
      await page.locator('#stats-unit-filter-period').selectOption('last-90'); await sleep(700);
      await page.screenshot({ path: join(out, '1280-estatisticas-ultimos-90-padrao.png'), fullPage: true });
      // por conteudo: filtro de disciplina vs log
      await page.locator('#tab-stats-unit').click(); await sleep(600);
      report.beh.statsPorConteudoLog = await page.evaluate(() => ({ seletores: [...document.querySelectorAll('#view-stats-unit select')].map((s) => ({ id: s.id, val: s.options[s.selectedIndex]?.textContent.trim() })), linhasLog: [...document.querySelectorAll('[data-screen-panel="stats"] table')].map((t) => ({ cls: t.className, linhas: t.querySelectorAll('tbody tr').length })) }));
    });

    await scenario('configuracoes', async () => {
      await go(page, 'settings');
      report.beh.cfgEstrutura = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="settings"] h2, [data-screen-panel="settings"] h3')].map((h) => h.innerText.trim()));
      // idioma: sem mudar nada, salvar da feedback?
      const langBtn = page.getByRole('button', { name: 'Salvar idioma' });
      report.beh.idiomaBotaoHabilitadoSemMudanca = await langBtn.isEnabled();
      await langBtn.click(); await sleep(600);
      report.beh.idiomaFeedback = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="settings"] [role=status], [data-screen-panel="settings"] .form-message')].map((e) => e.innerText.trim()).filter(Boolean));
      report.beh.idiomaOpcoes = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="settings"] select')].map((s) => ({ id: s.id, val: s.value, opts: [...s.options].map((o) => o.textContent.trim()).slice(0, 30) })).filter((x) => !/theme/.test(x.id)));
      // experimento persiste?
      const exp = page.locator('[data-screen-panel="settings"] input[type=checkbox]').first();
      report.beh.experimentoAntes = await exp.isChecked(); await exp.check(); await sleep(400);
      await page.reload(); await page.waitForFunction(() => window.location.hash.length > 1); await go(page, 'settings');
      report.beh.experimentoDepoisDeRecarregar = await page.locator('[data-screen-panel="settings"] input[type=checkbox]').first().isChecked();
      await page.locator('[data-screen-panel="settings"] input[type=checkbox]').first().uncheck(); await sleep(300);
      // diagnostico copiado
      await page.getByRole('button', { name: 'Copiar diagnóstico' }).click(); await sleep(600);
      report.beh.diagnosticoClipboard = await page.evaluate(() => navigator.clipboard.readText().then((t) => t.slice(0, 600)).catch((e) => 'ERRO ' + e.message));
      report.beh.diagnosticoFeedback = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="settings"] [role=status], [data-screen-panel="settings"] .form-message')].map((e) => e.innerText.trim()).filter(Boolean));
      await page.screenshot({ path: join(out, '1280-configuracoes-depois-de-copiar-diagnostico.png'), fullPage: true });
    });

    await scenario('conta', async () => {
      const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
      await c2.addInitScript(initScript, api);
      const p = await c2.newPage();
      await p.goto(origin); await p.waitForFunction(() => window.location.hash.length > 1);
      report.beh.semSessaoTelaInicial = await p.evaluate(() => ({ hash: location.hash, titulo: document.querySelector('h1:not([hidden])')?.innerText, navVisivel: [...document.querySelectorAll('nav [data-screen]')].filter((e) => e.offsetParent).map((e) => e.innerText.trim()) }));
      report.beh.semSessaoNav = {};
      for (const s of ['today', 'plan', 'stats', 'settings', 'materials']) {
        await p.locator(`[data-screen="${s}"]:visible`).first().click(); await sleep(1200);
        report.beh.semSessaoNav[s] = await p.evaluate(() => ({ h1: [...document.querySelectorAll('h1')].find((h) => h.offsetParent)?.innerText ?? null, texto: (document.querySelector('[data-screen-panel]:not([hidden])')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 230) }));
        await p.screenshot({ path: join(out, `1280-sem-sessao-${s}.png`) });
      }
      await p.locator('[data-screen="account"]:visible').first().click(); await sleep(500);
      report.beh.loginCampos = await p.evaluate(() => [...document.querySelectorAll('#account-login-form input')].map((i) => ({ id: i.id, type: i.type, autocomplete: i.autocomplete, required: i.required, placeholder: i.placeholder })));
      report.beh.loginTemMostrarSenha = await p.evaluate(() => !!document.querySelector('#account-login-form [aria-label*="senha" i], #account-login-form button:not([type=submit]):not(#account-show-register)'));
      // senha curta no cadastro: mensagem
      await p.locator('#account-show-register').click(); await sleep(300);
      await p.locator('#account-register-email').fill(`curta-${Date.now()}@example.com`); await p.locator('#account-register-password').fill('curta123');
      await p.locator('#account-register-form button[type=submit]').click(); await sleep(600);
      report.beh.cadastroSenhaCurta = await p.evaluate(() => ({ validationMessage: document.querySelector('#account-register-password')?.validationMessage, msg: document.querySelector('#account-register-message')?.innerText, hint: document.querySelector('#account-register-form .field-hint')?.innerText }));
      await p.screenshot({ path: join(out, '1280-cadastro-senha-curta.png') });
      // login com senha errada: foco e mensagem
      await p.locator('#account-show-login').click(); await sleep(300);
      await p.locator('#account-login-email').fill(DEV_ACCOUNT.email); await p.locator('#account-login-password').fill('senha-errada-de-proposito'); await p.locator('#account-login-form button[type=submit]').click(); await sleep(900);
      report.beh.loginErro = await p.evaluate(() => ({ msg: document.querySelector('#account-login-message')?.innerText, ariaInvalid: document.querySelector('#account-login-password')?.getAttribute('aria-invalid'), foco: document.activeElement?.id, senhaLimpa: document.querySelector('#account-login-password')?.value === '' }));
      await c2.close();
      // logada: alterar senha e sair
      await go(page, 'account');
      report.beh.contaLogada = await page.evaluate(() => ({ texto: document.querySelector('#account-logged-in-view')?.innerText.replace(/\s+/g, ' '), detalhesAberto: document.querySelector('#account-password-details')?.open, status: document.querySelector('#account-logged-in-as')?.innerText, glifo: getComputedStyle(document.querySelector('#account-logged-in-as')).color }));
      await page.locator('#account-password-details summary, #account-password-details').first().click(); await sleep(400);
      report.beh.alterarSenhaCampos = await page.evaluate(() => ({ campos: [...document.querySelectorAll('#account-password-form input')].map((i) => ({ id: i.id, autocomplete: i.autocomplete, minlength: i.minLength })), hint: document.querySelector('#account-password-form .field-hint')?.innerText ?? null }));
      await page.screenshot({ path: join(out, '1280-conta-alterar-senha-aberto.png') });
    });

    await scenario('materiais-e-rascunho', async () => {
      await go(page, 'materials');
      report.beh.materiaisAntesDoUpload = await page.evaluate(() => [...document.querySelectorAll('[data-screen-panel="materials"] button, [data-screen-panel="materials"] a')].filter((e) => e.offsetParent).map((e) => e.innerText.trim()).filter(Boolean));
      await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([PAGE_1, PAGE_2]) });
      await page.locator('#sources-message').filter({ hasText: /trechos? propostos?/ }).waitFor({ timeout: 15000 });
      report.beh.materiaisDepoisDoUpload = await page.evaluate(() => ({ botoes: [...document.querySelectorAll('[data-screen-panel="materials"] button, [data-screen-panel="materials"] a, [data-screen-panel="materials"] summary')].filter((e) => e.offsetParent).map((e) => e.innerText.trim()).filter(Boolean), temRemover: [...document.querySelectorAll('[data-screen-panel="materials"] button')].some((b) => /remov|exclu|apag|delet/i.test(b.innerText + (b.getAttribute('aria-label') || ''))), campos: [...document.querySelectorAll('[data-screen-panel="materials"] input, [data-screen-panel="materials"] textarea')].filter((e) => e.offsetParent).map((e) => ({ id: e.id, type: e.type, label: e.labels?.[0]?.innerText?.trim() ?? e.getAttribute('aria-label') ?? null, borda: getComputedStyle(e).borderTopWidth + ' ' + getComputedStyle(e).borderTopColor, h: Math.round(e.getBoundingClientRect().height) })) }));
      // estado de geracao: observar o que a tela mostra enquanto gera (a rota e atrasada 2,5 s so para ver o estado)
      await page.route('**/v1/**/drafts*', async (route) => { await sleep(2500); await route.continue(); });
      await page.route('**/v1/**draft**', async (route) => { if (route.request().method() === 'POST') await sleep(2500); await route.continue(); });
      await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
      await sleep(900);
      report.beh.durantGeracao = await page.evaluate(() => ({ texto: (document.querySelector('[data-screen-panel="materials"]')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 600), botaoGerarDesabilitado: [...document.querySelectorAll('[data-action="generate-draft"]')].map((b) => ({ dis: b.disabled, txt: b.innerText.trim(), ariaBusy: b.getAttribute('aria-busy') })), status: [...document.querySelectorAll('[role=status], [aria-live]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 4) }));
      await page.screenshot({ path: join(out, '1280-materiais-durante-geracao.png') });
      await page.unroute('**/v1/**/drafts*'); await page.unroute('**/v1/**draft**');
      await page.locator('.lesson-editor').waitFor({ state: 'visible', timeout: 25000 });
      // editor: disciplina padrao, cores, acoes por questao
      report.beh.editorAceite = await page.evaluate(() => {
        const sel = document.querySelector('.lesson-accept select');
        const swatches = [...document.querySelectorAll('.lesson-accept [role=radio], .lesson-accept input[type=radio], .lesson-accept .color-swatch, .lesson-accept [class*=swatch]')];
        return { selectOpcoes: sel ? [...sel.options].map((o) => o.textContent.trim()) : null, selectValor: sel?.options[sel.selectedIndex]?.textContent.trim(), nSwatches: swatches.length, swatchSemNome: swatches.filter((s) => !(s.getAttribute('aria-label') || s.title || s.innerText.trim() || s.labels?.[0]?.innerText?.trim())).length, swatchHtml: swatches[0]?.outerHTML.slice(0, 260), swatchSize: swatches[0] ? Math.round(swatches[0].getBoundingClientRect().width) : null };
      });
      await page.locator('.lesson-editor').getByRole('tab', { name: /Questões/ }).click(); await sleep(500);
      report.beh.editorAcoesQuestao = await page.evaluate(() => [...document.querySelectorAll('.lesson-editor button')].filter((b) => b.offsetParent && /questão|Salvar|Aceitar|Rejeitar|Excluir/i.test(b.innerText)).map((b) => ({ txt: b.innerText.trim(), title: b.title || null, describedby: b.getAttribute('aria-describedby'), cls: String(b.className).slice(0, 40) })));
      report.beh.editorTextosAjuda = await page.evaluate(() => [...document.querySelectorAll('.lesson-editor [class*=hint], .lesson-editor small, .lesson-editor [role=note]')].filter((e) => e.offsetParent).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 8));
      // aceitar sem escolher/nomear disciplina: o que acontece
      await page.locator('.lesson-accept').getByRole('button', { name: 'Aceitar e criar aula' }).click(); await sleep(900);
      report.beh.editorAceitarSemNomear = await page.evaluate(() => ({ msgs: [...document.querySelectorAll('.lesson-accept [role=status], .lesson-accept .form-message, .lesson-accept [role=alert]')].map((e) => e.innerText.trim()).filter(Boolean), foco: document.activeElement?.id || document.activeElement?.className?.slice(0, 40) }));
      await page.screenshot({ path: join(out, '1280-editor-aceitar-sem-nomear-disciplina.png'), fullPage: true });
    });

    report.beh.errors = errors;
    await ctx.close();
  }

  await browser.close();
} catch (e) {
  report.fatal = String(e.stack ?? e).slice(0, 1500);
} finally {
  for (const p of procs) p.kill();
  await sleep(300);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  report.finished = new Date().toISOString();
  report.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(out, `_auditoria-${mode}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode, seconds: report.seconds, fatal: report.fatal ?? null, scenarioErrors: report.scenarioErrors, notes: report.notes }, null, 1));
}
