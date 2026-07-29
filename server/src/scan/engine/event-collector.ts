import type { Page } from "playwright";
import type { EventEntry, EventSource, Framework } from "../../../../core/types/event-entry.js";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";

// ---------------------------------------------------------------------------
// Browser-side raw result (plain JSON, no enums)
// ---------------------------------------------------------------------------

interface RawEventEntry {
  targetId: string;
  semanticId: string;
  selector: string;
  tagName: string;
  text: string;
  eventTypes: string[];
  sources: string[];
  rect: { top: number; left: number; width: number; height: number };
  priority: number;
  listGroupKey: string | undefined;
  isVisible: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect all interactive elements on the current page.
 * Returns entries ordered by priority ascending (1 = highest).
 */
export async function collectEventEntries(
  page: Page,
  framework: Framework = "auto",
): Promise<Omit<EventEntry, "layer" | "status">[]> {
  const raw = await page.evaluate(
    (payload: { shim: string; framework: Framework }): RawEventEntry[] => {
      eval(payload.shim);

      // -----------------------------------------------------------------------
      // Helpers
      // -----------------------------------------------------------------------
      const truncate = (s: string, n: number) => s.slice(0, n);

      function getVisibleText(el: Element): string {
        const t = (el as HTMLElement).innerText ?? el.textContent ?? "";
        return truncate(t.replace(/\s+/g, " ").trim(), 40);
      }

      function isVisible(el: Element): boolean {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const style = window.getComputedStyle(el);
        return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
      }

      function buildSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const testId = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id");
        if (testId) return `[data-testid="${testId}"]`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
        // Stable class-based selector
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
        // Simple djb2 hash — no crypto in browser evaluate
        let hash = 5381;
        for (let i = 0; i < key.length; i++) {
          hash = (hash * 33) ^ key.charCodeAt(i);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
      }

      function buildSemanticId(eventType: string, tagName: string, text: string): string {
        const key = `${eventType}|${tagName}|${text}`;
        let hash = 5381;
        for (let i = 0; i < key.length; i++) {
          hash = (hash * 33) ^ key.charCodeAt(i);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
      }

      function buildListGroupKey(el: Element): string | undefined {
        const parent = el.parentElement;
        if (!parent) return undefined;
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName,
        );
        if (siblings.length < 3) return undefined;
        // Use parent's selector as group key
        const parentSel = buildSelector(parent);
        return `${parentSel}>${el.tagName.toLowerCase()}`;
      }

      // -----------------------------------------------------------------------
      // Detect framework
      // -----------------------------------------------------------------------
      let fw = payload.framework as string;
      if (fw === "auto") {
        if ((window as unknown as Record<string, unknown>).ng) fw = "angular";
        else if ((window as unknown as Record<string, unknown>).__VUE__) fw = "vue";
        else if (
          (window as unknown as Record<string, unknown>).React ||
          document.querySelector("[data-reactroot]")
        )
          fw = "react";
        else fw = "native";
      }

      // -----------------------------------------------------------------------
      // Collect :hover CSS rules → set of selectors
      // -----------------------------------------------------------------------
      const hoverSelectors = new Set<string>();
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (rule.type !== CSSRule.STYLE_RULE) continue;
          const sr = rule as CSSStyleRule;
          if (sr.selectorText?.includes(":hover")) {
            // Store base selector (without :hover)
            hoverSelectors.add(sr.selectorText.replace(/:hover/g, "").trim());
          }
        }
      }

      function hasHoverRule(el: Element): boolean {
        for (const sel of hoverSelectors) {
          if (!sel) continue;
          try {
            if (el.matches(sel)) return true;
          } catch {
            // invalid selector — skip
          }
        }
        return false;
      }

      // -----------------------------------------------------------------------
      // Per-element event detection
      // -----------------------------------------------------------------------
      interface ElInfo {
        el: Element;
        eventTypes: string[];
        sources: string[];
        priority: number;
      }

      function detectEvents(el: Element): ElInfo | null {
        const eventTypes: string[] = [];
        const sources: string[] = [];
        let priority = 99;

        // Priority 1: inline handlers
        const elAny = el as unknown as Record<string, unknown>;
        const inlineMap: Record<string, string> = {
          onclick: "click",
          onmouseenter: "mouseenter",
          onmouseleave: "mouseleave",
          onmouseover: "mouseover",
        };
        for (const [attr, evType] of Object.entries(inlineMap)) {
          if (elAny[attr] != null) {
            if (!eventTypes.includes(evType)) eventTypes.push(evType);
            if (!sources.includes("inline")) sources.push("inline");
            priority = Math.min(priority, 1);
          }
        }

        // Priority 2: framework events
        if (fw === "angular") {
          const zoneClick = elAny["__zone_symbol__clickfalse"];
          const zoneME = elAny["__zone_symbol__mouseenterfalse"];
          if (Array.isArray(zoneClick) && zoneClick.length > 0) {
            if (!eventTypes.includes("click")) eventTypes.push("click");
            if (!sources.includes("angular")) sources.push("angular");
            priority = Math.min(priority, 2);
          }
          if (Array.isArray(zoneME) && zoneME.length > 0) {
            if (!eventTypes.includes("mouseenter")) eventTypes.push("mouseenter");
            if (!sources.includes("angular")) sources.push("angular");
            priority = Math.min(priority, 2);
          }
        } else if (fw === "react") {
          const fiberKey = Object.keys(elAny).find(
            (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
          );
          if (fiberKey) {
            const fiber = elAny[fiberKey] as
              | { memoizedProps?: Record<string, unknown> }
              | undefined;
            if (fiber?.memoizedProps?.onClick) {
              if (!eventTypes.includes("click")) eventTypes.push("click");
              if (!sources.includes("react")) sources.push("react");
              priority = Math.min(priority, 2);
            }
            if (
              fiber?.memoizedProps?.onMouseEnter ||
              fiber?.memoizedProps?.onMouseOver
            ) {
              if (!eventTypes.includes("mouseenter")) eventTypes.push("mouseenter");
              if (!sources.includes("react")) sources.push("react");
              priority = Math.min(priority, 2);
            }
          }
        } else if (fw === "vue") {
          const vueKey = Object.keys(elAny).find(
            (k) => k.startsWith("__vue") || k === "__vueParentComponent",
          );
          if (vueKey) {
            const vnode = elAny[vueKey] as
              | { props?: Record<string, unknown> }
              | undefined;
            if (vnode?.props?.onClick || vnode?.props?.["onClick"]) {
              if (!eventTypes.includes("click")) eventTypes.push("click");
              if (!sources.includes("vue")) sources.push("vue");
              priority = Math.min(priority, 2);
            }
          }
        }

        // Priority 3: CSS :hover
        if (hasHoverRule(el)) {
          if (!eventTypes.includes("mouseenter")) eventTypes.push("mouseenter");
          if (!sources.includes("hover")) sources.push("hover");
          priority = Math.min(priority, 3);
        }

        // Native semantic elements always get click (lowest priority)
        const tag = el.tagName.toLowerCase();
        if (
          tag === "a" ||
          tag === "button" ||
          el.getAttribute("role") === "button" ||
          el.getAttribute("role") === "menuitem" ||
          el.getAttribute("role") === "tab" ||
          el.getAttribute("role") === "link"
        ) {
          if (!eventTypes.includes("click")) eventTypes.push("click");
          if (!sources.includes("inline")) sources.push("inline");
          priority = Math.min(priority, 1);
        }

        if (eventTypes.length === 0) return null;
        return { el, eventTypes, sources, priority };
      }

      // -----------------------------------------------------------------------
      // Traverse all DOM elements
      // -----------------------------------------------------------------------
      const results: RawEventEntry[] = [];
      const seen = new Set<string>();

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let node: Node | null = walker.currentNode;
      while (node) {
        const el = node as Element;
        const info = detectEvents(el);
        if (info && isVisible(el)) {
          const rect = el.getBoundingClientRect();
          const rectPlain = {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
          const text = getVisibleText(el);
          const tagName = el.tagName.toLowerCase();
          const targetId = buildTargetId(tagName, text, rect);
          if (!seen.has(targetId)) {
            seen.add(targetId);
            const semanticId = buildSemanticId(info.eventTypes[0] ?? "click", tagName, text);
            results.push({
              targetId,
              semanticId,
              selector: buildSelector(el),
              tagName,
              text,
              eventTypes: info.eventTypes,
              sources: info.sources as string[],
              rect: rectPlain,
              priority: info.priority,
              listGroupKey: buildListGroupKey(el),
              isVisible: true,
            });
          }
        }
        node = walker.nextNode();
      }

      return results;
    },
    { shim: BROWSER_EVAL_SHIM, framework },
  );

  return raw.map((r) => ({
    ...r,
    sources: r.sources as EventSource[],
  }));
}
