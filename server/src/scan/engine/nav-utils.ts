import type { Page } from "playwright";
import type { EventEntry, EventEntryDraft } from "../../../../core/types/event-entry.js";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";

/** 是否为导航类：仅依据采集时由 probe-selectors.nav 打上的标记。 */
export function isNavigationEntry(
  entry: Pick<EventEntry, "isNavigation">,
): boolean {
  return entry.isNavigation === true;
}

/**
 * 用 probe-selectors 中 category=nav 的选择器，在页面上标记导航条目。
 * 不内置任何框架/组件选择器。
 */
export async function markNavigationEntries(
  page: Page,
  entries: EventEntryDraft[],
  navSelectors: string[],
): Promise<EventEntryDraft[]> {
  if (entries.length === 0) return entries;
  if (navSelectors.length === 0) {
    return entries.map((e) => ({ ...e, isNavigation: false }));
  }

  const flags = await page.evaluate(
    (payload: {
      shim: string;
      selectors: string[];
      targets: Array<{ selector: string; top: number; left: number; width: number; height: number }>;
    }): boolean[] => {
      eval(payload.shim);

      const matchesNav = (el: Element): boolean => {
        for (const sel of payload.selectors) {
          try {
            if (el.matches(sel)) return true;
          } catch {
            // invalid selector
          }
        }
        return false;
      };

      return payload.targets.map((t) => {
        try {
          const nodes = Array.from(document.querySelectorAll(t.selector));
          if (nodes.length === 0) return false;
          if (nodes.length === 1) return matchesNav(nodes[0]!);

          const cx = t.left + t.width / 2;
          const cy = t.top + t.height / 2;
          for (const el of nodes) {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (
              cx >= r.left &&
              cx <= r.left + r.width &&
              cy >= r.top &&
              cy <= r.top + r.height
            ) {
              return matchesNav(el);
            }
          }
          return matchesNav(nodes[0]!);
        } catch {
          return false;
        }
      });
    },
    {
      shim: BROWSER_EVAL_SHIM,
      selectors: navSelectors,
      targets: entries.map((e) => ({
        selector: e.selector,
        top: e.rect.top,
        left: e.rect.left,
        width: e.rect.width,
        height: e.rect.height,
      })),
    },
  );

  return entries.map((entry, i) => ({
    ...entry,
    isNavigation: Boolean(flags[i]),
  }));
}
