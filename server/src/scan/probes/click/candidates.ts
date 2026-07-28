import type { Page } from "playwright";
import { ScopeType, type ClickTargetIdentity } from "../../../types.js";
import { buildTargetId } from "../../utils/target-id.js";
import type { OverlayInfo } from "./overlay.js";
import { OVERLAY_CANDIDATE_SELECTORS, CLOSE_HINT_SELECTORS } from "./overlay.js";
import { BROWSER_EVAL_SHIM } from "../../utils/browser-shim.js";

export interface CollectScope {
  type: ScopeType;
  overlay?: OverlayInfo;
}

const CLICKABLE_SELECTORS = [
  "a[href]",
  "a.thy-nav-item",
  "thy-menu-item",
  "button:not([disabled])",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "input[type='button']:not([disabled])",
  "input[type='submit']:not([disabled])",
  ".ant-btn:not([disabled])",
  "a.thy-action",
  "[tabindex]:not([tabindex='-1'])",
];

/** Browser-side collector — no nested named fns (esbuild/tsx injects __name). */
export async function collectClickTargets(
  page: Page,
  scope: CollectScope,
): Promise<ClickTargetIdentity[]> {
  const raw = await page.evaluate(
    (payload: {
      shim: string;
      args: {
        clickableSels: string[];
        overlaySels: string[];
        closeSels: string[];
        scopeType: ScopeType;
        overlaySelector?: string;
        scopeLabel?: string;
        layer: number;
      };
    }) => {
      eval(payload.shim);
      const {
        clickableSels,
        overlaySels,
        closeSels,
        scopeType,
        overlaySelector,
        scopeLabel,
        layer,
      } = payload.args;

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

      const nodes = Array.from(root.querySelectorAll(clickableSels.join(",")));
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
          typeof className === "string"
            ? className.split(/\s+/).filter(Boolean).join(" ")
            : "";
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
          .filter(
            (c) =>
              !/^ng-/.test(c) &&
              !/^cdk-/.test(c) &&
              !/^(active|focus|hover|selected|disabled|open)$/i.test(c),
          )
          .slice(0, 4);
      };
      const nthOfType = (el: Element): number | undefined => {
        const parent = el.parentElement;
        if (!parent) return undefined;
        const tag = el.tagName.toLowerCase();
        const siblings = Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === tag);
        if (siblings.length <= 1) return undefined;
        const idx = siblings.indexOf(el);
        return idx >= 0 ? idx + 1 : undefined;
      };

      for (const el of nodes) {
        if (scopeType === "page") {
          let insideOverlay = false;
          for (let si = 0; si < overlaySels.length; si++) {
            if (el.closest(overlaySels[si]!)) {
              insideOverlay = true;
              break;
            }
          }
          if (insideOverlay) continue;
        }

        let isClose = false;
        for (let ci = 0; ci < closeSels.length; ci++) {
          const sel = closeSels[ci]!;
          if (el.matches(sel) || el.closest(sel)) {
            isClose = true;
            break;
          }
        }
        if (!isClose) {
          const textProbe = (
            (el as HTMLElement).innerText ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.getAttribute("thyicon") ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();
          if (/^(关闭|close|×|✕)$/i.test(textProbe)) isClose = true;
          if (/关闭|close/i.test(el.getAttribute("thyicon") || "")) isClose = true;
        }
        if (isClose) continue;

        const html = el as HTMLElement;
        const style = window.getComputedStyle(html);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          continue;
        }
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
        if (el.matches("a.thy-nav-item")) component = "thy-nav-item";
        else if (el.matches("thy-menu-item")) component = "thy-menu-item";
        else if (el.matches("a.thy-action")) component = "thy-action";
        else if (el.closest("thy-menu-item") && !el.matches("thy-menu-item")) {
          const parent = el.closest("thy-menu-item")!;
          clickEl = parent;
          component = "thy-menu-item";
        }

        const roleAttr = clickEl.getAttribute("role");
        let role = roleAttr || (clickEl.tagName.toLowerCase() === "a" ? "link" : "button");
        if (clickEl.matches("thy-menu-item")) role = "menuitem";
        if (clickEl.matches("a.thy-nav-item")) role = "tab";

        const clickRect = (clickEl as HTMLElement).getBoundingClientRect();
        const elementId = clickEl.id || undefined;

        const dedupeKey = `${label}|${component}|${elementId}|${Math.round(clickRect.top)}|${Math.round(clickRect.left)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        let dialogTitle: string | undefined;
        if (scopeType === "overlay") {
          const titleEl = (root as Element).querySelector(
            ".ant-modal-title, .thy-dialog-header, [class*='title']",
          );
          dialogTitle = titleEl?.textContent?.trim().slice(0, 60);
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

        const activeNav = document.querySelector(
          "a.thy-nav-item.active, a.thy-nav-item[class*='active']",
        );
        const activeNavRoute = activeNav?.textContent?.trim().slice(0, 60) || undefined;

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
    {
      shim: BROWSER_EVAL_SHIM,
      args: {
        clickableSels: CLICKABLE_SELECTORS,
        overlaySels: OVERLAY_CANDIDATE_SELECTORS,
        closeSels: CLOSE_HINT_SELECTORS,
        scopeType: scope.type,
        overlaySelector: scope.overlay?.selector,
        scopeLabel: scope.overlay?.scopeLabel,
        layer: scope.overlay?.layer ?? 0,
      },
    },
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
export async function collectNavTargets(page: Page): Promise<ClickTargetIdentity[]> {
  const raw = await page.evaluate((shim: string) => {
    eval(shim);
    const out: Array<{
      label: string;
      labelSource: string;
      role: string;
      tag: string;
      component?: string;
      elementId?: string;
      scope: { type: string; scopeLabel?: string; layer: number };
      anchors?: { activeNavRoute?: string };
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

    const navItems = Array.from(document.querySelectorAll("a.thy-nav-item"));
    for (const el of navItems) {
      const html = el as HTMLElement;
      const style = window.getComputedStyle(html);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = html.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      const label = html.innerText?.replace(/\s+/g, " ").trim().slice(0, 80) || "[无文本]";
      const attrs: Record<string, string> = {};
      if (el.id) attrs.id = el.id;
      const ar = el.getAttribute("aria-label");
      if (ar) attrs["aria-label"] = ar;
      attrs.role = "tab";
      out.push({
        label,
        labelSource: "text",
        role: "tab",
        tag: "a",
        component: "thy-nav-item",
        elementId: el.id || undefined,
        scope: { type: "page", scopeLabel: "顶栏导航", layer: 0 },
        position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        matchContext: {
          searchText: [label, "顶栏导航", el.id].filter(Boolean).join(" "),
          attributes: attrs,
          selectorSelf: elementTokens(el),
          parentChain: collectParentChain(el),
        },
      });
    }

    const menuItems = Array.from(document.querySelectorAll("thy-menu-item"));
    const activeNav = document.querySelector(
      "a.thy-nav-item.active, a.thy-nav-item[class*='active']",
    );
    const activeNavRoute = activeNav?.textContent?.trim().slice(0, 60) || undefined;

    for (const el of menuItems) {
      const html = el as HTMLElement;
      const style = window.getComputedStyle(html);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = html.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      const content = html.querySelector(".thy-menu-item-content");
      const label =
        (content?.textContent || html.innerText || html.getAttribute("title") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80) || el.id || "[无文本]";
      const menuAttrs: Record<string, string> = {};
      if (el.id) menuAttrs.id = el.id;
      menuAttrs.role = "menuitem";
      const navPath = activeNavRoute
        ? [
            { kind: "nav-route", label: activeNavRoute, component: "thy-nav-item" },
            { kind: "menu-item", label, component: "thy-menu-item", elementId: el.id || undefined },
          ]
        : [{ kind: "menu-item", label, component: "thy-menu-item", elementId: el.id || undefined }];
      out.push({
        label,
        labelSource: "text",
        role: "menuitem",
        tag: "thy-menu-item",
        component: "thy-menu-item",
        elementId: el.id || undefined,
        scope: { type: "page", scopeLabel: "侧栏菜单", layer: 0 },
        anchors: { activeNavRoute },
        navigationPath: navPath,
        position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        matchContext: {
          searchText: [label, "侧栏菜单", activeNavRoute, el.id].filter(Boolean).join(" "),
          attributes: menuAttrs,
          selectorSelf: elementTokens(el),
          parentChain: collectParentChain(el),
        },
      });
    }

    return out;
  }, BROWSER_EVAL_SHIM);

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
