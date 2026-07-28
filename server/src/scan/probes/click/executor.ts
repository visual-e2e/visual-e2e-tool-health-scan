import type { Page } from "playwright";
import {
  ClickOutcome,
  ClickPolicy,
  IssueCategory,
  IssueSeverity,
  PhaseName,
  ScanStatus,
  ScopeType,
  SkipReason,
} from "../../../types.js";
import {
  addClickAction,
  addIssue,
  markPhase,
  recordClickFailure,
  touch,
  type ActiveScan,
} from "../../session-context.js";
import { runLayoutProbe } from "../layout.js";
import { runNetworkSnapshot } from "../../collectors/network.js";
import { waitUntilStable } from "../../utils/stable-wait.js";
import { sleep } from "../../utils/sleep.js";
import { collectClickTargets } from "./candidates.js";
import { closeTopOverlay, detectOverlayStack } from "./close.js";
import { sortClickTargets } from "./rules.js";
import { tryClickTarget } from "./resolver.js";

async function waitWhilePaused(session: ActiveScan): Promise<boolean> {
  while (!session.abort && (session.pauseRequested || session.status === ScanStatus.Paused)) {
    if (session.status !== ScanStatus.Paused) {
      session.status = ScanStatus.Paused;
      session.progress = "已暂停，可继续或停止";
      touch(session);
    }
    await sleep(200);
  }
  return !session.abort;
}

async function closeExtraTabs(session: ActiveScan, page: Page): Promise<void> {
  const pages = session.context?.pages() ?? [];
  for (const p of pages) {
    if (p !== page && !p.isClosed()) await p.close().catch(() => undefined);
  }
}

async function ensureSameOrigin(session: ActiveScan, page: Page): Promise<void> {
  try {
    const startHost = new URL(session.startUrl).host;
    const curHost = new URL(page.url()).host;
    if (curHost !== startHost) {
      await page.goto(session.startUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
  } catch {
    // ignore
  }
}

async function refreshAndReprobe(session: ActiveScan, page: Page): Promise<void> {
  session.progress = "连续失败，刷新页面并重探…";
  touch(session);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await waitUntilStable(page, {
    settleMs: session.options.settleMs,
    networkIdleMs: session.options.networkIdleMs,
  });
  if (session.options.enableNetwork) await runNetworkSnapshot(session, page);
  if (session.options.enableLayout) await runLayoutProbe(session, page);
}

export async function runClickProbe(session: ActiveScan, page: Page): Promise<void> {
  session.progress = "交互检查（暴力点击）…";
  touch(session);
  markPhase(session, PhaseName.Click, false);

  const max = session.options.maxClicks;
  const tried = new Set<string>();
  let consecutiveErrors = 0;
  const maxDialogContentClicks = 8;
  let dialogContentClicks = 0;

  while (session.clicksTried < max) {
    if (!(await waitWhilePaused(session))) return;

    const overlayStack = await detectOverlayStack(page);
    const topOverlay = overlayStack[0];
    const inOverlay = Boolean(topOverlay);

    const scope = inOverlay
      ? { type: ScopeType.Overlay, overlay: topOverlay }
      : { type: ScopeType.Page };

    let candidates = await collectClickTargets(page, scope);

    if (session.options.enableNavigationProbe) {
      candidates = candidates.filter(
        (c) => c.component !== "thy-nav-item" && c.component !== "thy-menu-item",
      );
    }

    let scored = sortClickTargets(candidates, session.options);

    if (inOverlay) {
      scored = scored.filter((s) => !/^(关闭|close|×|✕)$/i.test(s.target.label));
    } else {
      scored = scored.filter((s) => !/^(关闭|close|×|✕)$/i.test(s.target.label));
    }

    let nextScored = scored.find((s) => !tried.has(s.target.targetId));

    if (inOverlay && nextScored && dialogContentClicks >= maxDialogContentClicks) {
      nextScored = undefined;
    }

    if (!nextScored) {
      if (inOverlay) {
        session.progress = `关闭浮层… (${session.clicksTried + 1}/${max})`;
        touch(session);
        const closed = await closeTopOverlay(page);
        session.clicksTried += 1;
        dialogContentClicks = 0;
        if (!closed) {
          addIssue(session, {
            category: IssueCategory.Click,
            severity: IssueSeverity.Warning,
            title: "浮层关闭失败",
            detail: "浮层内容已点完，但未能关闭",
            pageUrl: page.url(),
          });
          touch(session);
          break;
        }
        await page.waitForTimeout(session.options.clickDelayMs);
        continue;
      }
      break;
    }

    if (nextScored.skipReason === SkipReason.Blacklist) {
      tried.add(nextScored.target.targetId);
      session.clicksSkipped += 1;
      addClickAction(session, {
        pageUrl: page.url(),
        target: nextScored.target,
        outcome: ClickOutcome.Skipped,
        skipReason: SkipReason.Blacklist,
        score: nextScored.score,
        matchedRules: nextScored.matchedRules,
      });
      continue;
    }

    if (
      session.options.clickPolicy === ClickPolicy.WhitelistOnly &&
      nextScored.score <= session.options.defaultWeight
    ) {
      tried.add(nextScored.target.targetId);
      session.clicksSkipped += 1;
      addClickAction(session, {
        pageUrl: page.url(),
        target: nextScored.target,
        outcome: ClickOutcome.Skipped,
        skipReason: SkipReason.NotInWhitelist,
        score: nextScored.score,
        matchedRules: nextScored.matchedRules,
      });
      continue;
    }

    const label = nextScored.target.label;
    const ctx = nextScored.target.scope.scopeLabel;
    session.progress = `点击 ${session.clicksTried + 1}/${max}: ${ctx ? `${ctx} › ` : ""}${label}`;
    session.status = ScanStatus.Running;
    touch(session);

    const result = await tryClickTarget(page, nextScored.target);
    tried.add(nextScored.target.targetId);
    session.clicksTried += 1;
    if (inOverlay) dialogContentClicks += 1;

    addClickAction(session, {
      pageUrl: page.url(),
      target: nextScored.target,
      outcome: result.ok ? ClickOutcome.Success : ClickOutcome.Failed,
      score: nextScored.score,
      matchedRules: nextScored.matchedRules,
      error: result.error,
    });

    if (result.ok) {
      consecutiveErrors = 0;
    } else {
      consecutiveErrors += 1;
      recordClickFailure(session, page.url(), nextScored.target, result.error);

      if (
        consecutiveErrors >= session.options.consecutiveErrorLimit &&
        session.options.refreshOnConsecutiveErrors
      ) {
        consecutiveErrors = 0;
        tried.clear();
        dialogContentClicks = 0;
        await refreshAndReprobe(session, page);
      }
    }

    await page.waitForTimeout(session.options.clickDelayMs + session.options.postClickSettleMs);
    if (!(await waitWhilePaused(session))) return;
    await closeExtraTabs(session, page);
    await ensureSameOrigin(session, page);

    if (!inOverlay) dialogContentClicks = 0;
  }

  markPhase(session, PhaseName.Click, true);
  touch(session);
}
