import { expect } from '@playwright/test';

/**
 * Answers the app's own confirmation (the in-page <dialog id="confirm-dialog">, never the browser's window.confirm) and returns
 * the sentence it asked. Call it right after the click that opens it.
 */
export async function answerConfirm(page, accept) {
  await expect(page.locator('#confirm-dialog')).toBeVisible({ timeout: 5000 });
  const message = (await page.locator('#confirm-dialog-message').textContent()) ?? '';
  await page.locator(accept ? '#confirm-dialog-ok' : '#confirm-dialog-cancel').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden();
  return message;
}

/** For a path where the confirmation appears only if something was still unsaved: answers it when it opens within a short wait, and does nothing when it never does. */
export async function answerConfirmIfAsked(page, accept) {
  const opened = await page.locator('#confirm-dialog').waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);
  if (opened) await answerConfirm(page, accept);
  return opened;
}
