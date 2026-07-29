import type { Page } from "playwright";
import {
  ClickOutcome,
  ClickSuccessMode,
  FailureCode,
  PhaseName,
  ScanStatus,
  SkipReason,
  getDefaultProbeSelectors,
  resolveProbeSelectors,
} from "../../types.js";
import {
  addClickAction,
  markPhase,
  recordClickFailure,
  touch,
  type ActiveScan,
} from "../session-context.js";
import { collectHoverTargets } from "./click/candidates.js";
import { sortClickTargets } from "./click/rules.js";
import { tryHoverTarget } from "./click/resolver.js";
import {
  capturePageFingerprint,
  fingerprintsDiffer,
} from "../utils/page-fingerprint.js";
import { sleep } from "../utils/sleep.js";

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

export async function runHoverProbe(session: ActiveScan, page: Page): Promise<void> {
  if (!session.options.enableHoverProbe || !session.options.enableClick) return;

  const probe = session.options.probeSelectors ?? getDefaultProbeSelectors();
  const resolved = resolveProbeSelectors(probe);
  if (!resolved.hoverable.length) return;

  session.progress = "悬停探测…";
  touch(session);
  markPhase(session, PhaseName.Hover, false);

  const targets = await collectHoverTargets(page, probe);
  const scored = sortClickTargets(targets, session.options);
  const mode = session.options.clickSuccessMode ?? ClickSuccessMode.DomChange;

  for (const item of scored) {
    if (session.clicksTried >= session.options.maxClicks) break;
    if (!(await waitWhilePaused(session))) return;

    if (item.skipReason === SkipReason.Blacklist) {
      session.clicksSkipped += 1;
      addClickAction(session, {
        pageUrl: page.url(),
        target: item.target,
        outcome: ClickOutcome.Skipped,
        skipReason: SkipReason.Blacklist,
        score: item.score,
        matchedRules: item.matchedRules,
      });
      continue;
    }

    session.progress = `悬停 ${item.target.label}`;
    session.status = ScanStatus.Running;
    touch(session);

    const beforeFp =
      mode === ClickSuccessMode.DomChange
        ? await capturePageFingerprint(page, resolved.overlay)
        : null;

    const result = await tryHoverTarget(page, item.target);
    session.clicksTried += 1;

    let ok = result.ok;
    let error = result.error;
    if (ok && beforeFp && mode === ClickSuccessMode.DomChange) {
      await page.waitForTimeout(session.options.postClickSettleMs);
      const afterFp = await capturePageFingerprint(page, resolved.overlay);
      if (!fingerprintsDiffer(beforeFp, afterFp)) {
        ok = false;
        error = FailureCode.NoVisibleEffect;
      }
    }

    // Move mouse away to avoid sticky hover menus blocking later probes
    await page.mouse.move(0, 0).catch(() => undefined);
    await page.waitForTimeout(120);

    addClickAction(session, {
      pageUrl: page.url(),
      target: item.target,
      outcome: ok ? ClickOutcome.Success : ClickOutcome.Failed,
      score: item.score,
      matchedRules: item.matchedRules,
      error: ok ? undefined : error,
    });

    if (!ok) recordClickFailure(session, page.url(), item.target, error);

    await page.waitForTimeout(session.options.clickDelayMs);
  }

  markPhase(session, PhaseName.Hover, true);
  touch(session);
}
