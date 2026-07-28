import type { Page } from "playwright";
import { BROWSER_EVAL_SHIM } from "../../utils/browser-shim.js";

export interface OverlayInfo {
  selector: string;
  layer: number;
  zIndex: number;
  scopeLabel?: string;
  rect: { top: number; left: number; width: number; height: number };
}

const OVERLAY_CANDIDATE_SELECTORS = [
  "thy-dialog-container",
  ".cdk-overlay-pane",
  '[role="dialog"][aria-modal="true"]',
  '[role="dialog"]',
  ".ant-modal-wrap",
  ".ant-modal-content",
  ".ant-drawer-content",
  ".modal",
  ".overlay",
  ".popup",
];

const CLOSE_HINT_SELECTORS = [
  'a.thy-action[thyicon="close"]',
  ".thy-icon-close",
  "button.ant-modal-close",
  ".ant-modal-close",
  '[aria-label="关闭"]',
  '[aria-label="Close"]',
  '[aria-label="close"]',
  'button[thyicon="close"]',
];

export { CLOSE_HINT_SELECTORS, OVERLAY_CANDIDATE_SELECTORS };

export async function detectOverlayStack(page: Page): Promise<OverlayInfo[]> {
  return page.evaluate(
    (payload: { shim: string; selectors: string[] }) => {
      eval(payload.shim);
      const selectors = payload.selectors;
      const found: Array<{
        selector: string;
        layer: number;
        zIndex: number;
        scopeLabel?: string;
        rect: { top: number; left: number; width: number; height: number };
      }> = [];
      const seen = new Set<Element>();

      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const style = window.getComputedStyle(el as HTMLElement);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width <= 8 || rect.height <= 8) continue;

          let zIndex = 0;
          let node: Element | null = el;
          while (node && node !== document.documentElement) {
            const st = window.getComputedStyle(node as HTMLElement);
            if (st.position !== "static" && st.zIndex !== "auto") {
              const zi = parseInt(st.zIndex, 10);
              if (!isNaN(zi)) zIndex = Math.max(zIndex, zi);
            }
            node = node.parentElement;
          }

          let scopeLabel = "浮层";
          const role = el.getAttribute("role");
          if (role === "dialog") {
            const title = el.querySelector(
              ".ant-modal-title, .thy-dialog-header, [class*='title'], h1, h2, h3",
            );
            const t = title?.textContent?.trim();
            scopeLabel = t ? `弹框：${t.slice(0, 40)}` : "弹框";
          } else if (el.matches("thy-dialog-container")) {
            scopeLabel = "弹框";
          } else if (el.matches(".ant-drawer-content")) {
            scopeLabel = "抽屉";
          }

          found.push({
            selector: sel,
            layer: 0,
            zIndex,
            scopeLabel,
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }

      found.sort((a, b) => b.zIndex - a.zIndex || b.rect.width * b.rect.height - a.rect.width * a.rect.height);
      return found.map((o, i) => ({ ...o, layer: i + 1 }));
    },
    { shim: BROWSER_EVAL_SHIM, selectors: OVERLAY_CANDIDATE_SELECTORS },
  );
}

export async function hasOpenOverlay(page: Page): Promise<boolean> {
  const stack = await detectOverlayStack(page);
  return stack.length > 0;
}
