import type { Page } from "playwright";

export interface PageFingerprint {
  url: string;
  overlayCount: number;
  nodeCount: number;
  textLen: number;
}

export async function capturePageFingerprint(
  page: Page,
  overlaySelectors: string[],
): Promise<PageFingerprint> {
  const url = page.url();
  const stats = await page
    .evaluate((sels: string[]) => {
      const seen = new Set<Element>();
      let overlayCount = 0;
      for (const sel of sels) {
        try {
          for (const el of document.querySelectorAll(sel)) {
            if (seen.has(el)) continue;
            seen.add(el);
            const style = window.getComputedStyle(el as HTMLElement);
            if (style.display === "none" || style.visibility === "hidden") continue;
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width > 8 && rect.height > 8) overlayCount += 1;
          }
        } catch {
          // invalid selector
        }
      }
      const body = document.body;
      const text = body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
      return {
        overlayCount,
        nodeCount: body?.querySelectorAll("*").length ?? 0,
        textLen: text.length,
      };
    }, overlaySelectors)
    .catch(() => ({ overlayCount: 0, nodeCount: 0, textLen: 0 }));

  return { url, ...stats };
}

export function fingerprintsDiffer(before: PageFingerprint, after: PageFingerprint): boolean {
  if (before.url !== after.url) return true;
  if (before.overlayCount !== after.overlayCount) return true;
  if (Math.abs(before.nodeCount - after.nodeCount) >= 3) return true;
  if (Math.abs(before.textLen - after.textLen) >= 8) return true;
  return false;
}
