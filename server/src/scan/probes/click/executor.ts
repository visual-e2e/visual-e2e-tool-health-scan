import type { Page } from "playwright";
import {
  ClickOutcome,
  ClickSuccessMode,
  FailureCode,
  IssueCategory,
  IssueSeverity,
  PhaseName,
  ScanStatus,
  ScopeType,
  getDefaultProbeSelectors,
  resolveProbeSelectors,
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
import { capturePageFingerprint, fingerprintsDiffer } from "../../utils/page-fingerprint.js";
import { collectClickTargets, NAV_COMPONENT } from "./candidates.js";
import { closeTopOverlay, detectOverlayStack } from "./close.js";
import { sortClickTargets } from "./rules.js";
import { pickNextTarget, shouldSkipTarget } from "./policy.js";
import { tryClickTarget } from "./resolver.js";
import { classifyClickFailure } from "../../../report/issue-classifier.js";
import { captureFailureScreenshot } from "../../../report/artifact-writer.js";
import { tryRecoverFromFailure } from "./recover.js";

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
  const probe = session.options.probeSelectors ?? getDefaultProbeSelectors();
  const resolved = resolveProbeSelectors(probe);
  const successMode = session.options.clickSuccessMode ?? ClickSuccessMode.DomChange;

  while (session.clicksTried < max) {
    if (!(await waitWhilePaused(session))) return;

    const overlayStack = await detectOverlayStack(page, resolved.overlay, resolved.overlayTitle);
    const topOverlay = overlayStack[0];
    const inOverlay = Boolean(topOverlay);

    const scope = inOverlay
      ? { type: ScopeType.Overlay, overlay: topOverlay }
      : { type: ScopeType.Page };

    let candidates = await collectClickTargets(page, scope, probe);

    if (session.options.enableNavigationProbe) {
      candidates = candidates.filter((c) => c.component !== NAV_COMPONENT);
    }

    const scored = sortClickTargets(candidates, session.options).filter(
      (s) => !/^(关闭|close|×|✕)$/i.test(s.target.label),
    );

    let nextScored = pickNextTarget(scored, tried);

    if (inOverlay && nextScored && dialogContentClicks >= maxDialogContentClicks) {
      nextScored = undefined;
    }

    if (!nextScored) {
      if (inOverlay) {
        session.progress = `关闭浮层… (${session.clicksTried + 1}/${max})`;
        touch(session);
        const closed = await closeTopOverlay(
          page,
          resolved.overlayClose,
          resolved.overlay,
          resolved.overlayTitle,
        );
        session.clicksTried += 1;
        dialogContentClicks = 0;
        if (!closed) {
          addIssue(session, {
            category: IssueCategory.Click,
            severity: IssueSeverity.Warning,
            title: "浮层关闭失败",
            detail: "浮层内容已点完，但未能关闭",
            pageUrl: page.url(),
            failureCode: FailureCode.OverlayCloseFailed,
          });
          touch(session);
          break;
        }
        await page.waitForTimeout(session.options.clickDelayMs);
        continue;
      }
      break;
    }

    const skipReason = shouldSkipTarget(nextScored, session.options);
    if (skipReason) {
      tried.add(nextScored.target.targetId);
      session.clicksSkipped += 1;
      addClickAction(session, {
        pageUrl: page.url(),
        target: nextScored.target,
        outcome: ClickOutcome.Skipped,
        skipReason,
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

    const beforeFp =
      successMode === ClickSuccessMode.DomChange
        ? await capturePageFingerprint(page, resolved.overlay)
        : null;

    let result = await tryClickTarget(page, nextScored.target);
    let failureCode = result.ok ? undefined : classifyClickFailure(result.error);

    if (!result.ok && failureCode) {
      const recovered = await tryRecoverFromFailure(page, failureCode, probe);
      if (recovered) {
        result = await tryClickTarget(page, nextScored.target);
        failureCode = result.ok ? undefined : classifyClickFailure(result.error);
      }
    }

    if (result.ok && beforeFp && successMode === ClickSuccessMode.DomChange) {
      await page.waitForTimeout(session.options.postClickSettleMs);
      const afterFp = await capturePageFingerprint(page, resolved.overlay);
      if (!fingerprintsDiffer(beforeFp, afterFp)) {
        result = { ok: false, error: "点击后页面无明显变化" };
        failureCode = FailureCode.NoVisibleEffect;
      }
    }

    let screenshotPath: string | undefined;
    if (
      !result.ok &&
      session.options.enableFailureScreenshot !== false &&
      session.page
    ) {
      screenshotPath = await captureFailureScreenshot(
        page,
        session.profileId || session.projectId,
        session.reportId || session.id,
        nextScored.target.targetId,
      );
    }

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
      failureCode,
      screenshotPath,
    });

    if (result.ok) {
      consecutiveErrors = 0;
    } else {
      consecutiveErrors += 1;
      recordClickFailure(session, page.url(), nextScored.target, result.error, failureCode, screenshotPath);

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
