import type { Page } from "playwright";
import { BROWSER_EVAL_SHIM } from "../../utils/browser-shim.js";
import { getDefaultProbeSelectors, resolveProbeSelectors } from "../../../types.js";

export interface OverlayInfo {
  selector: string;
  layer: number;
  zIndex: number;
  scopeLabel?: string;
  rect: { top: number; left: number; width: number; height: number };
}

const defaultResolved = () => resolveProbeSelectors(getDefaultProbeSelectors());

export async function detectOverlayStack(
  page: Page,
  overlaySelectors: string[] = defaultResolved().overlay,
  overlayTitleSelectors: string[] = defaultResolved().overlayTitle,
): Promise<OverlayInfo[]> {
  return page.evaluate(
    (payload: { shim: string; selectors: string[]; titleSels: string[] }) => {
      eval(payload.shim);
      const selectors = payload.selectors;
      const titleSels = payload.titleSels;
      const found: Array<{
        selector: string;
        layer: number;
        zIndex: number;
        scopeLabel?: string;
        rect: { top: number; left: number; width: number; height: number };
      }> = [];
      const seen = new Set<Element>();

      for (const sel of selectors) {
        let nodes: NodeListOf<Element>;
        try {
          nodes = document.querySelectorAll(sel);
        } catch {
          continue;
        }
        for (const el of nodes) {
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
          if (role === "dialog" || titleSels.length) {
            let title: Element | null = null;
            for (const ts of titleSels) {
              try {
                title = el.querySelector(ts);
              } catch {
                continue;
              }
              if (title?.textContent?.trim()) break;
            }
            const t = title?.textContent?.trim();
            scopeLabel = t ? `弹框：${t.slice(0, 40)}` : role === "dialog" ? "弹框" : "浮层";
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

      found.sort(
        (a, b) =>
          b.zIndex - a.zIndex || b.rect.width * b.rect.height - a.rect.width * a.rect.height,
      );
      return found.map((o, i) => ({ ...o, layer: i + 1 }));
    },
    { shim: BROWSER_EVAL_SHIM, selectors: overlaySelectors, titleSels: overlayTitleSelectors },
  );
}

export async function hasOpenOverlay(
  page: Page,
  overlaySelectors?: string[],
  overlayTitleSelectors?: string[],
): Promise<boolean> {
  const stack = await detectOverlayStack(page, overlaySelectors, overlayTitleSelectors);
  return stack.length > 0;
}
