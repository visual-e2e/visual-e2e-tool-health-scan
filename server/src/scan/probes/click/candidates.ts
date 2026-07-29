import type { Page } from "playwright";
import {
  ScopeType,
  getDefaultProbeSelectors,
  resolveProbeSelectors,
  type ClickTargetIdentity,
  type ProbeSelectorsConfig,
} from "../../../types.js";
import { buildTargetId } from "../../utils/target-id.js";
import type { OverlayInfo } from "./overlay.js";
import { BROWSER_EVAL_SHIM } from "../../utils/browser-shim.js";

/** Unified nav/menu component tag (replaces nav-top / nav-side). */
export const NAV_COMPONENT = "nav";
/** @deprecated use NAV_COMPONENT */
export const NAV_TOP_COMPONENT = NAV_COMPONENT;
/** @deprecated use NAV_COMPONENT */
export const NAV_SIDE_COMPONENT = NAV_COMPONENT;

export interface CollectScope {
  type: ScopeType;
  overlay?: OverlayInfo;
}

/** Browser-side collector — no nested named fns (esbuild/tsx injects __name). */
export async function collectClickTargets(
  page: Page,
  scope: CollectScope,
  probe: ProbeSelectorsConfig = getDefaultProbeSelectors(),
): Promise<ClickTargetIdentity[]> {
  const raw = await page.evaluate(
    (payload: {
      shim: string;
      args: {
        clickableSels: string[];
        overlaySels: string[];
        closeSels: string[];
        navSels: string[];
        hoverSels: string[];
        overlayTitleSels: string[];
        scopeType: ScopeType;
        overlaySelector?: string;
        scopeLabel?: string;
        layer: number;
      };
    }) => {
      eval(payload.shim);
      const {
        clickableSels,
        closeSels,
        navSels,
        hoverSels,
        overlayTitleSels,
        scopeType,
        overlaySelector,
        scopeLabel,
        layer,
      } = payload.args;

      const safeQueryAll = (root: ParentNode, sels: string[]): Element[] => {
        const out: Element[] = [];
        for (const sel of sels) {
          try {
            out.push(...Array.from(root.querySelectorAll(sel)));
          } catch {
            // skip invalid
          }
        }
        return out;
      };

      const matchesAny = (el: Element, sels: string[]): boolean => {
        for (const sel of sels) {
          try {
            if (el.matches(sel)) return true;
          } catch {
            // skip
          }
        }
        return false;
      };

      const closestAny = (el: Element, sels: string[]): Element | null => {
        for (const sel of sels) {
          try {
            const hit = el.closest(sel);
            if (hit) return hit;
          } catch {
            // skip
          }
        }
        return null;
      };

      let root: ParentNode = document;
      if (scopeType === "overlay" && overlaySelector) {
        const overlays = Array.from(document.querySelectorAll(overlaySelector));
        let found: Element | null = null;
        let bestZ = -1;
        for (const el of overlays) {
          const style = window.getComputedStyle(el as HTMLElement);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width <= 8 || rect.height <= 8) continue;
          let z = 0;
          let node: Element | null = el;
          while (node && node !== document.documentElement) {
            const st = window.getComputedStyle(node as HTMLElement);
            if (st.position !== "static" && st.zIndex !== "auto") {
              const zi = parseInt(st.zIndex, 10);
              if (!isNaN(zi)) z = Math.max(z, zi);
            }
            node = node.parentElement;
          }
          if (z >= bestZ) {
            bestZ = z;
            found = el;
          }
        }
        if (!found) return [];
        root = found;
      }

      const nodes = safeQueryAll(root, clickableSels);
      const out: Array<{
        label: string;
        labelSource: string;
        role: string;
        tag: string;
        component?: string;
        elementId?: string;
        scope: { type: string; scopeLabel?: string; layer: number };
        anchors?: {
          dialogTitle?: string;
          sectionHeading?: string;
          activeNavRoute?: string;
        };
        position: { top: number; left: number; width: number; height: number };
        matchContext: {
          searchText: string;
          attributes: Record<string, string>;
          selectorSelf: string;
          parentChain: string[];
        };
        locatorHints?: {
          tag: string;
          stableClasses: string[];
          ariaLabel?: string;
          title?: string;
          thyicon?: string;
          nthOfType?: number;
        };
      }> = [];
      const seen = new Set<string>();
      const elementTokens = (node: Element): string => {
        const tag = (node.localName || node.nodeName).toLowerCase();
        const className = (node as HTMLElement).className;
        const classes =
          typeof className === "string" ? className.split(/\s+/).filter(Boolean).join(" ") : "";
        return [tag, classes].filter(Boolean).join(" ");
      };
      const collectParentChain = (start: Element): string[] => {
        const chain: string[] = [];
        let cursor: Element | null = start;
        while (cursor) {
          chain.push(elementTokens(cursor));
          cursor = cursor.parentElement;
        }
        return chain;
      };
      const stableClasses = (el: Element): string[] => {
        const className = (el as HTMLElement).className;
        if (typeof className !== "string") return [];
        return className
          .split(/\s+/)
          .filter(Boolean)
          .filter((c) => !/^(ng-|cdk-|ant-btn-loading|active|selected|hover|focus)/.test(c))
          .slice(0, 4);
      };
      const nthOfType = (el: Element): number => {
        const tag = el.tagName;
        let n = 1;
        let sib = el.previousElementSibling;
        while (sib) {
          if (sib.tagName === tag) n += 1;
          sib = sib.previousElementSibling;
        }
        return n;
      };

      for (const el of nodes) {
        const html = el as HTMLElement;
        if (
          closeSels.some((s) => {
            try {
              return html.matches(s);
            } catch {
              return false;
            }
          })
        ) {
          continue;
        }

        const style = window.getComputedStyle(html);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = html.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        if (html.getAttribute("aria-disabled") === "true") continue;
        if ((html as HTMLButtonElement).disabled) continue;
        if (style.pointerEvents === "none") continue;

        const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) continue;

        let label = "";
        let labelSource = "text";
        const inner = html.innerText?.replace(/\s+/g, " ").trim();
        if (inner) {
          label = inner.slice(0, 80);
        } else if (html.getAttribute("aria-label")) {
          label = html.getAttribute("aria-label")!.slice(0, 80);
          labelSource = "aria-label";
        } else if (html.getAttribute("title")) {
          label = html.getAttribute("title")!.slice(0, 80);
          labelSource = "title";
        } else if (html.getAttribute("placeholder")) {
          label = html.getAttribute("placeholder")!.slice(0, 80);
          labelSource = "placeholder";
        } else if (html.getAttribute("thyicon")) {
          label = html.getAttribute("thyicon")!;
          labelSource = "icon";
        } else {
          label = "[无文本]";
        }

        let clickEl = el;
        let component: string | undefined;
        if (matchesAny(el, navSels)) component = "nav";
        else {
          const navParent = closestAny(el, navSels);
          if (navParent && navParent !== el) {
            clickEl = navParent;
            component = "nav";
          }
        }
        if (!component && matchesAny(el, hoverSels)) component = "hover";

        const roleAttr = clickEl.getAttribute("role");
        let role = roleAttr || (clickEl.tagName.toLowerCase() === "a" ? "link" : "button");
        if (component === "nav") {
          role = roleAttr === "tab" ? "tab" : "menuitem";
        }

        const clickRect = (clickEl as HTMLElement).getBoundingClientRect();
        const elementId = clickEl.id || undefined;

        const dedupeKey = `${label}|${component}|${elementId}|${Math.round(clickRect.top)}|${Math.round(clickRect.left)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        let dialogTitle: string | undefined;
        if (scopeType === "overlay") {
          for (const ts of overlayTitleSels) {
            try {
              const titleEl = (root as Element).querySelector(ts);
              const t = titleEl?.textContent?.trim();
              if (t) {
                dialogTitle = t.slice(0, 60);
                break;
              }
            } catch {
              // skip
            }
          }
        }

        let sectionHeading: string | undefined;
        let walk: Element | null = clickEl;
        while (walk) {
          const h = walk.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4");
          if (h?.textContent?.trim()) {
            sectionHeading = h.textContent.trim().slice(0, 60);
            break;
          }
          walk = walk.parentElement;
        }

        let activeNavRoute: string | undefined;
        try {
          const activeNav = document.querySelector("[aria-current='page'], [aria-selected='true']");
          const t = activeNav?.textContent?.trim();
          if (t) activeNavRoute = t.slice(0, 60);
        } catch {
          // skip
        }

        const selectorSelf = elementTokens(clickEl);

        const attributes: Record<string, string> = {};
        if (clickEl.id) attributes.id = clickEl.id;
        const ariaLabel = clickEl.getAttribute("aria-label");
        if (ariaLabel) attributes["aria-label"] = ariaLabel;
        const titleAttr = clickEl.getAttribute("title");
        if (titleAttr) attributes.title = titleAttr;
        const thyicon = clickEl.getAttribute("thyicon");
        if (thyicon) attributes.thyicon = thyicon;
        const roleAttrVal = clickEl.getAttribute("role");
        if (roleAttrVal) attributes.role = roleAttrVal;

        const parentChain = collectParentChain(clickEl);

        const searchParts = [
          label,
          scopeType === "overlay" ? scopeLabel : "",
          elementId,
          dialogTitle,
          sectionHeading,
          activeNavRoute,
        ].filter(Boolean);
        const searchText = searchParts.join(" ");

        out.push({
          label,
          labelSource,
          role,
          tag: clickEl.tagName.toLowerCase(),
          component,
          elementId,
          scope: {
            type: scopeType,
            scopeLabel: scopeType === "overlay" ? scopeLabel : undefined,
            layer,
          },
          anchors: {
            dialogTitle,
            sectionHeading,
            activeNavRoute,
          },
          position: {
            top: clickRect.top,
            left: clickRect.left,
            width: clickRect.width,
            height: clickRect.height,
          },
          matchContext: {
            searchText,
            attributes,
            selectorSelf,
            parentChain,
          },
          locatorHints: {
            tag: clickEl.tagName.toLowerCase(),
            stableClasses: stableClasses(clickEl),
            ariaLabel: ariaLabel || undefined,
            title: titleAttr || undefined,
            thyicon: thyicon || undefined,
            nthOfType: nthOfType(clickEl),
          },
        });

        if (out.length >= 100) break;
      }

      return out;
    },
    (() => {
      const resolved = resolveProbeSelectors(probe);
      return {
        shim: BROWSER_EVAL_SHIM,
        args: {
          clickableSels: resolved.clickable,
          overlaySels: resolved.overlay,
          closeSels: resolved.overlayClose,
          navSels: resolved.nav,
          hoverSels: resolved.hoverable,
          overlayTitleSels: resolved.overlayTitle,
          scopeType: scope.type,
          overlaySelector: scope.overlay?.selector,
          scopeLabel: scope.overlay?.scopeLabel,
          layer: scope.overlay?.layer ?? 0,
        },
      };
    })(),
  );

  return raw.map((partial) => ({
    ...partial,
    labelSource: partial.labelSource as ClickTargetIdentity["labelSource"],
    scope: {
      ...partial.scope,
      type: partial.scope.type as ClickTargetIdentity["scope"]["type"],
    },
    targetId: buildTargetId(partial as Omit<ClickTargetIdentity, "targetId">),
  }));
}

/** Collect nav and menu items specifically for navigation probe. */
export async function collectNavTargets(
  page: Page,
  probe: ProbeSelectorsConfig = getDefaultProbeSelectors(),
): Promise<ClickTargetIdentity[]> {
  const resolved = resolveProbeSelectors(probe);
  const raw = await page.evaluate(
    (payload: { shim: string; navSels: string[] }) => {
      eval(payload.shim);
      const { navSels } = payload;

      const safeQueryAll = (sels: string[]): Element[] => {
        const out: Element[] = [];
        const seen = new Set<Element>();
        for (const sel of sels) {
          try {
            for (const el of document.querySelectorAll(sel)) {
              if (seen.has(el)) continue;
              seen.add(el);
              out.push(el);
            }
          } catch {
            // skip
          }
        }
        return out;
      };

      const out: Array<{
        label: string;
        labelSource: string;
        role: string;
        tag: string;
        component?: string;
        elementId?: string;
        scope: { type: string; scopeLabel?: string; layer: number };
        navigationPath?: Array<{
          kind: string;
          label: string;
          component?: string;
          elementId?: string;
        }>;
        position: { top: number; left: number; width: number; height: number };
        matchContext: {
          searchText: string;
          attributes: Record<string, string>;
          selectorSelf: string;
          parentChain: string[];
        };
      }> = [];
      const elementTokens = (node: Element): string => {
        const tag = (node.localName || node.nodeName).toLowerCase();
        const className = (node as HTMLElement).className;
        const classes =
          typeof className === "string" ? className.split(/\s+/).filter(Boolean).join(" ") : "";
        return [tag, classes].filter(Boolean).join(" ");
      };
      const collectParentChain = (start: Element): string[] => {
        const chain: string[] = [];
        let cursor: Element | null = start;
        while (cursor) {
          chain.push(elementTokens(cursor));
          cursor = cursor.parentElement;
        }
        return chain;
      };

      for (const el of safeQueryAll(navSels)) {
        const html = el as HTMLElement;
        const style = window.getComputedStyle(html);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = html.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const label =
          html.innerText?.replace(/\s+/g, " ").trim().slice(0, 80) ||
          html.getAttribute("aria-label")?.slice(0, 80) ||
          html.getAttribute("title")?.slice(0, 80) ||
          el.id ||
          "[无文本]";
        const roleAttr = el.getAttribute("role");
        const role = roleAttr === "tab" ? "tab" : roleAttr || "menuitem";
        const attrs: Record<string, string> = {};
        if (el.id) attrs.id = el.id;
        const ar = el.getAttribute("aria-label");
        if (ar) attrs["aria-label"] = ar;
        attrs.role = role;
        out.push({
          label,
          labelSource: "text",
          role,
          tag: el.tagName.toLowerCase(),
          component: "nav",
          elementId: el.id || undefined,
          scope: { type: "page", scopeLabel: "导航/菜单", layer: 0 },
          navigationPath: [{ kind: "menu-item", label, component: "nav", elementId: el.id || undefined }],
          position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          matchContext: {
            searchText: [label, "导航", el.id].filter(Boolean).join(" "),
            attributes: attrs,
            selectorSelf: elementTokens(el),
            parentChain: collectParentChain(el),
          },
        });
      }

      return out;
    },
    {
      shim: BROWSER_EVAL_SHIM,
      navSels: resolved.nav,
    },
  );

  return raw.map((partial) => ({
    ...partial,
    labelSource: partial.labelSource as ClickTargetIdentity["labelSource"],
    scope: {
      ...partial.scope,
      type: partial.scope.type as ClickTargetIdentity["scope"]["type"],
    },
    navigationPath: partial.navigationPath as ClickTargetIdentity["navigationPath"],
    targetId: buildTargetId(partial as Omit<ClickTargetIdentity, "targetId">),
  }));
}

export async function collectHoverTargets(
  page: Page,
  probe: ProbeSelectorsConfig = getDefaultProbeSelectors(),
): Promise<ClickTargetIdentity[]> {
  const resolved = resolveProbeSelectors(probe);
  if (!resolved.hoverable.length) return [];
  const raw = await page.evaluate(
    (payload: { shim: string; hoverSels: string[] }) => {
      eval(payload.shim);
      const { hoverSels } = payload;
      const out: Array<{
        label: string;
        labelSource: string;
        role: string;
        tag: string;
        component?: string;
        elementId?: string;
        scope: { type: string; scopeLabel?: string; layer: number };
        position: { top: number; left: number; width: number; height: number };
        matchContext: {
          searchText: string;
          attributes: Record<string, string>;
          selectorSelf: string;
          parentChain: string[];
        };
      }> = [];
      const seen = new Set<Element>();
      const elementTokens = (node: Element): string => {
        const tag = (node.localName || node.nodeName).toLowerCase();
        const className = (node as HTMLElement).className;
        const classes =
          typeof className === "string" ? className.split(/\s+/).filter(Boolean).join(" ") : "";
        return [tag, classes].filter(Boolean).join(" ");
      };
      const collectParentChain = (start: Element): string[] => {
        const chain: string[] = [];
        let cursor: Element | null = start;
        while (cursor) {
          chain.push(elementTokens(cursor));
          cursor = cursor.parentElement;
        }
        return chain;
      };

      for (const sel of hoverSels) {
        try {
          for (const el of document.querySelectorAll(sel)) {
            if (seen.has(el)) continue;
            seen.add(el);
            const html = el as HTMLElement;
            const style = window.getComputedStyle(html);
            if (style.display === "none" || style.visibility === "hidden") continue;
            if (style.pointerEvents === "none") continue;
            const rect = html.getBoundingClientRect();
            if (rect.width < 4 || rect.height < 4) continue;
            const label =
              html.innerText?.replace(/\s+/g, " ").trim().slice(0, 80) ||
              html.getAttribute("aria-label")?.slice(0, 80) ||
              "[无文本]";
            const attrs: Record<string, string> = {};
            if (el.id) attrs.id = el.id;
            const hasPopup = el.getAttribute("aria-haspopup");
            if (hasPopup) attrs["aria-haspopup"] = hasPopup;
            const expanded = el.getAttribute("aria-expanded");
            if (expanded) attrs["aria-expanded"] = expanded;
            out.push({
              label,
              labelSource: "text",
              role: el.getAttribute("role") || "button",
              tag: el.tagName.toLowerCase(),
              component: "hover",
              elementId: el.id || undefined,
              scope: { type: "page", scopeLabel: "悬停", layer: 0 },
              position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
              matchContext: {
                searchText: [label, "悬停", el.id].filter(Boolean).join(" "),
                attributes: attrs,
                selectorSelf: elementTokens(el),
                parentChain: collectParentChain(el),
              },
            });
            if (out.length >= 80) return out;
          }
        } catch {
          // skip invalid
        }
      }
      return out;
    },
    { shim: BROWSER_EVAL_SHIM, hoverSels: resolved.hoverable },
  );

  return raw.map((partial) => ({
    ...partial,
    labelSource: partial.labelSource as ClickTargetIdentity["labelSource"],
    scope: {
      ...partial.scope,
      type: partial.scope.type as ClickTargetIdentity["scope"]["type"],
    },
    targetId: buildTargetId(partial as Omit<ClickTargetIdentity, "targetId">),
  }));
}
