import type { Page } from "playwright";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";
import { sleep } from "../utils/sleep.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomMutation {
  addedCount: number;
  removedCount: number;
  /** body 直接子节点变化 → 认为是路由级全量变化 */
  rootLevelChange: boolean;
}

export type MutationLevel =
  | "none" // 无变化
  | "partial" // 局部变化（弹窗、抽屉、Tab 切换）
  | "full"; // 路由级全量变化

// ---------------------------------------------------------------------------
// Observer injection
// ---------------------------------------------------------------------------

const OBSERVER_SCRIPT = `
(function() {
  if (window.__healthScanObserverActive) return;
  window.__healthScanObserverActive = true;
  window.__healthScanMutations = { addedCount: 0, removedCount: 0, rootLevelChange: false };

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      window.__healthScanMutations.addedCount += m.addedNodes.length;
      window.__healthScanMutations.removedCount += m.removedNodes.length;
      if (m.target === document.body) {
        window.__healthScanMutations.rootLevelChange = true;
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
`;

/**
 * 在页面注入 MutationObserver。
 * 幂等 — 页面内已注入时跳过。
 * 导航后需重新调用（新文档重置了 window）。
 */
export async function injectDomObserver(page: Page): Promise<void> {
  await page.evaluate(
    (payload: { shim: string; script: string }) => {
      eval(payload.shim);
      eval(payload.script);
    },
    { shim: BROWSER_EVAL_SHIM, script: OBSERVER_SCRIPT },
  );
}

// ---------------------------------------------------------------------------
// Drain & classify
// ---------------------------------------------------------------------------

/** 读取并清空累积的变化记录 */
export async function drainDomMutations(page: Page): Promise<DomMutation> {
  try {
    return await page.evaluate(
      (payload: { shim: string }): DomMutation => {
        eval(payload.shim);
        const w = window as unknown as {
          __healthScanMutations?: DomMutation;
        };
        const current = w.__healthScanMutations ?? {
          addedCount: 0,
          removedCount: 0,
          rootLevelChange: false,
        };
        // 清空
        w.__healthScanMutations = { addedCount: 0, removedCount: 0, rootLevelChange: false };
        return current;
      },
      { shim: BROWSER_EVAL_SHIM },
    );
  } catch {
    return { addedCount: 0, removedCount: 0, rootLevelChange: false };
  }
}

/**
 * 判断变化级别：
 *   none    → addedCount=0 && removedCount=0
 *   full    → rootLevelChange=true 或 removedCount >= 20
 *   partial → 其余
 */
export function classifyMutation(m: DomMutation): MutationLevel {
  if (m.addedCount === 0 && m.removedCount === 0) return "none";
  if (m.rootLevelChange || m.removedCount >= 20) return "full";
  return "partial";
}

// ---------------------------------------------------------------------------
// Wait for DOM change
// ---------------------------------------------------------------------------

/**
 * 等待 DOM 新增节点（addedCount > 0），带超时。
 * 每 200ms poll 一次。
 * 返回 true 表示检测到变化，false 表示超时。
 */
export async function waitForDomChange(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const current = await page.evaluate(
        (payload: { shim: string }): number => {
          eval(payload.shim);
          const w = window as unknown as { __healthScanMutations?: DomMutation };
          return w.__healthScanMutations?.addedCount ?? 0;
        },
        { shim: BROWSER_EVAL_SHIM },
      );
      if (current > 0) return true;
    } catch {
      return false;
    }
    await sleep(200);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Alive check (single element)
// ---------------------------------------------------------------------------

/**
 * 快速检查某个 selector 对应的元素是否还在 DOM 且可见。
 */
export async function isElementAlive(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.evaluate(
      (payload: { shim: string; selector: string }): boolean => {
        eval(payload.shim);
        try {
          const el = document.querySelector(payload.selector);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden";
        } catch {
          return false;
        }
      },
      { shim: BROWSER_EVAL_SHIM, selector },
    );
  } catch {
    return false;
  }
}
