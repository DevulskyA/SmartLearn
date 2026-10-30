// T-F6-03: the sign-in prelude most specs repeat. It used to drive the registration form and then the login form one after the
// other, after the page had finished loading, so every test paid ~3.5 s (the server's scrypt hash runs twice, on top of the page
// load). Registering is a plain public POST that the registration form sends as-is (src/auth-ui.js register), so the account is
// created over HTTP WHILE the page loads, and the real login form is still driven through the UI. The registration FORM stays
// covered by e2e/auth.spec.js, e2e/first-run.spec.js, e2e/student-journey.spec.js and e2e/product-value.spec.js, which keep it.
import { expect } from '@playwright/test';
import { VITE_ORIGIN } from './ports.js';

/**
 * src/app.js ends by calling showScreen(), which writes the screen into the URL hash, so a hash proves the module graph evaluated and
 * the navigation handlers are bound. Under `vite dev` a single module request can be refused (lesson-editor.spec.js:207: ERR_CONNECTION_REFUSED
 * on /src/stats.js, the whole of app.js never ran, the click on "Conta" did nothing). The dev server is test infrastructure, so reload once.
 */
async function ensureAppBooted(page) {
  const booted = () => page.waitForFunction(() => window.location.hash.length > 1, undefined, { timeout: 8000 }).then(() => true, () => false);
  if (await booted()) return;
  await page.reload();
  expect(await booted(), 'src/app.js did not boot after a reload (no screen in the URL hash)').toBeTruthy();
}

/**
 * Creates `email` over HTTP while the page settles, then signs in through the real login form and waits for the logged-in view.
 * The summary editor opens in Visual mode unless the student chose otherwise. Most specs drive the plain textarea, so they start as a student who
 * chose Text (only when no choice was stored yet: an explicit click on Visual later is kept across reloads). `summaryMode: null` = a new student.
 */
export async function signInRegistered(page, { email, password, summaryMode = 'text' }) {
  if (summaryMode) {
    await page.addInitScript((mode) => {
      try { if (localStorage.getItem('smartlearn.summary-mode') === null) localStorage.setItem('smartlearn.summary-mode', mode); } catch { /* storage unavailable */ }
    }, summaryMode);
  }
  await page.goto('/');
  await ensureAppBooted(page);
  // the account is created on the SAME server the page was told to use (a spec may run several), exactly where the form would post
  // (read right after goto, so it can land while the dev server is still reloading the page: only a destroyed context is retried)
  let apiBase;
  await expect.poll(async () => {
    apiBase = await page.evaluate(() => window.__SMARTLEARN_API_BASE__).catch(() => undefined);
    return Boolean(apiBase);
  }, { message: 'the spec must set window.__SMARTLEARN_API_BASE__ before signing in', timeout: 10000 }).toBeTruthy();
  // the browser form posts from the app's origin and the server only accepts its allowed origins on mutations
  const registration = page.request.post(`${apiBase}/v1/auth/register`, { data: { email, password }, headers: { Origin: VITE_ORIGIN } });
  await page.waitForLoadState('networkidle');
  const response = await registration;
  expect(response.ok(), `registering ${email} over HTTP failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
  // On phone widths, Conta is a secondary destination inside the Mais
  // popover. Exercise the real UI path rather than trying to click a
  // deliberately hidden button (which times out under Playwright).
  const accountNavigation = page.locator('[data-screen="account"]');
  if (!(await accountNavigation.isVisible())) {
    const more = page.locator('#mobile-more-toggle');
    if (await more.isVisible()) await more.click();
  }
  await accountNavigation.click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
}
