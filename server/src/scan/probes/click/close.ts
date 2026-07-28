import type { Page } from "playwright";
import {
  CLOSE_HINT_SELECTORS,
  detectOverlayStack,
  hasOpenOverlay,
  type OverlayInfo,
} from "./overlay.js";
import { tryClickTarget } from "./resolver.js";

async function tryClickCloseInOverlay(page: Page, overlay: OverlayInfo): Promise<boolean> {
  for (const sel of CLOSE_HINT_SELECTORS) {
    const candidates = [
      `${overlay.selector} ${sel}`,
      `.cdk-overlay-pane ${sel}`,
      `[role="dialog"] ${sel}`,
      sel,
    ];
    for (const candidate of candidates) {
      const loc = page.locator(candidate).first();
      const visible = await loc.isVisible().catch(() => false);
      if (!visible) continue;
      try {
        await loc.click({ timeout: 2000 });
        await page.waitForTimeout(300);
        if (!(await hasOpenOverlay(page))) return true;
      } catch {
        // try next
      }
    }
  }

  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);
  return !(await hasOpenOverlay(page));
}

export async function closeTopOverlay(page: Page): Promise<boolean> {
  const stack = await detectOverlayStack(page);
  if (stack.length === 0) return true;
  return tryClickCloseInOverlay(page, stack[0]!);
}

export { hasOpenOverlay, detectOverlayStack };
