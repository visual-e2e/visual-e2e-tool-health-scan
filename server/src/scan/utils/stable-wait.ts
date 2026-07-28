import type { Page } from "playwright";
import { sleep } from "./sleep.js";

export async function waitUntilStable(
  page: Page,
  opts: { settleMs: number; networkIdleMs: number },
): Promise<void> {
  const maxWait = opts.settleMs;
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  try {
    await page.waitForLoadState("networkidle", { timeout: Math.min(maxWait, 5000) });
  } catch {
    // SPA may never reach networkidle
  }

  await sleep(Math.min(opts.networkIdleMs, maxWait));
}
