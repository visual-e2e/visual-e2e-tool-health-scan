import type { Page } from "playwright";
import type { EventEntryDraft } from "../../../../core/types/event-entry.js";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";

interface RawProbeEntry {
  targetId: string;
  semanticId: string;
  selector: string;
  tagName: string;
  text: string;
  rect: { top: number; left: number; width: number; height: number };
  listGroupKey?: string;
  isNavigation: boolean;
  matchContext: {
    searchText: string;
    attributes: Record<string, string>;
    selectorSelf: string;
    parentChain: string[];
  };
}

/**
 * 按 probe-selectors 的 clickable 列表补采 DOM 候选。
 * navSelectors 来自 category=nav，用于标记 isNavigation。
 */
export async function collectProbeEntries(
  page: Page,
  clickableSelectors: string[],
  navSelectors: string[] = [],
): Promise<EventEntryDraft[]> {
  if (clickableSelectors.length === 0) return [];

  const raw = await page.evaluate(
    (payload: {
      shim: string;
      selectors: string[];
      navSelectors: string[];
    }): RawProbeEntry[] => {
      eval(payload.shim);

      const truncate = (s: string, n: number) => s.slice(0, n);

      function buildSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const testId = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id");
        if (testId) return `[data-testid="${testId}"]`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
        const tag = el.tagName.toLowerCase();
        const stableClasses = Array.from(el.classList)
          .filter((c) => !/^(ng-|v-|_|js-)/.test(c) && !/\d{4,}/.test(c))
          .slice(0, 3);
        if (stableClasses.length > 0) {
          return `${tag}.${stableClasses.join(".")}`;
        }
        return tag;
      }

      function buildTargetId(tagName: string, text: string, rect: DOMRect): string {
        const key = `${tagName}|${text}|${Math.round(rect.top / 10)}|${Math.round(rect.left / 10)}`;
        let hash = 5381;
        for (let i = 0; i < key.length; i++) {
          hash = (hash * 33) ^ key.charCodeAt(i);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
      }

      function buildSemanticId(tagName: string, text: string): string {
        const key = `click|${tagName}|${text}`;
        let hash = 5381;
        for (let i = 0; i < key.length; i++) {
          hash = (hash * 33) ^ key.charCodeAt(i);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
      }

      function elementTokens(node: Element): string {
        const tag = (node.localName || node.nodeName).toLowerCase();
        const className = (node as HTMLElement).className;
        const classes =
          typeof className === "string" ? className.split(/\s+/).filter(Boolean).join(" ") : "";
        return [tag, classes].filter(Boolean).join(" ");
      }

      function collectParentChain(start: Element): string[] {
        const chain: string[] = [];
        let cursor: Element | null = start;
        while (cursor) {
          chain.push(elementTokens(cursor));
          cursor = cursor.parentElement;
        }
        return chain;
      }

      function buildListGroupKey(el: Element): string | undefined {
        const parent = el.parentElement;
        if (!parent) return undefined;
        const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
        if (siblings.length < 3) return undefined;
        return `${buildSelector(parent)}>${el.tagName.toLowerCase()}`;
      }

      function isVisible(el: Element): boolean {
        const html = el as HTMLElement;
        const style = window.getComputedStyle(html);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        const rect = html.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return false;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
        if (html.getAttribute("aria-disabled") === "true") return false;
        if ((html as HTMLButtonElement).disabled) return false;
        if (style.pointerEvents === "none") return false;

        const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) return false;
        return true;
      }

      function getLabel(el: Element): string {
        const html = el as HTMLElement;
        const inner = html.innerText?.replace(/\s+/g, " ").trim();
        if (inner) return truncate(inner, 40);
        const aria = html.getAttribute("aria-label");
        if (aria) return truncate(aria, 40);
        const title = html.getAttribute("title");
        if (title) return truncate(title, 40);
        return "[无文本]";
      }

      function matchesAny(el: Element, sels: string[]): boolean {
        for (const sel of sels) {
          try {
            if (el.matches(sel)) return true;
          } catch {
            // skip
          }
        }
        return false;
      }

      const seenElements = new Set<Element>();
      const results: RawProbeEntry[] = [];

      for (const sel of payload.selectors) {
        let nodes: Element[] = [];
        try {
          nodes = Array.from(document.querySelectorAll(sel));
        } catch {
          continue;
        }

        for (const el of nodes) {
          if (seenElements.has(el)) continue;
          seenElements.add(el);
          if (!isVisible(el)) continue;

          const tagName = el.tagName.toLowerCase();
          const rect = el.getBoundingClientRect();
          const rectPlain = {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
          const text = getLabel(el);
          const selectorSelf = elementTokens(el);
          const attributes: Record<string, string> = {};
          if (el.id) attributes.id = el.id;
          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel) attributes["aria-label"] = ariaLabel;

          results.push({
            targetId: buildTargetId(tagName, text, rect),
            semanticId: buildSemanticId(tagName, text),
            selector: buildSelector(el),
            tagName,
            text,
            rect: rectPlain,
            listGroupKey: buildListGroupKey(el),
            isNavigation: matchesAny(el, payload.navSelectors),
            matchContext: {
              searchText: [text, selectorSelf, ...collectParentChain(el)].join(" "),
              attributes,
              selectorSelf,
              parentChain: collectParentChain(el),
            },
          });
        }
      }

      return results;
    },
    {
      shim: BROWSER_EVAL_SHIM,
      selectors: clickableSelectors,
      navSelectors,
    },
  );

  return raw.map((entry) => ({
    ...entry,
    eventTypes: ["click"],
    sources: ["probe" as const],
    priority: 4,
    isVisible: true,
  }));
}
