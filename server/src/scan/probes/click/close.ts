import type { Page } from "playwright";
import { detectOverlayStack, hasOpenOverlay, type OverlayInfo } from "./overlay.js";
import { getDefaultProbeSelectors, resolveProbeSelectors } from "../../../types.js";

const defaultResolved = () => resolveProbeSelectors(getDefaultProbeSelectors());

async function tryClickCloseInOverlay(
  page: Page,
  overlay: OverlayInfo,
  closeSelectors: string[],
  overlaySelectors: string[],
): Promise<boolean> {
  for (const sel of closeSelectors) {
    const candidates = [
      `${overlay.selector} ${sel}`,
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
        if (!(await hasOpenOverlay(page, overlaySelectors))) return true;
      } catch {
        // try next
      }
    }
  }

  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);
  return !(await hasOpenOverlay(page, overlaySelectors));
}

export async function closeTopOverlay(
  page: Page,
  closeSelectors: string[] = defaultResolved().overlayClose,
  overlaySelectors: string[] = defaultResolved().overlay,
  overlayTitleSelectors: string[] = defaultResolved().overlayTitle,
): Promise<boolean> {
  const stack = await detectOverlayStack(page, overlaySelectors, overlayTitleSelectors);
  if (stack.length === 0) return true;
  return tryClickCloseInOverlay(page, stack[0]!, closeSelectors, overlaySelectors);
}

export { hasOpenOverlay, detectOverlayStack };
