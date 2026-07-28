import type { Page } from "playwright";
import { ClickOutcome, PhaseName, ScanStatus, SkipReason } from "../../types.js";
import {
  addClickAction,
  markPhase,
  recordClickFailure,
  touch,
  type ActiveScan,
} from "../session-context.js";
import { collectNavTargets } from "./click/candidates.js";
import { sortClickTargets } from "./click/rules.js";
import { tryClickTarget } from "./click/resolver.js";
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

export async function runNavigationProbe(session: ActiveScan, page: Page): Promise<void> {
  if (!session.options.enableNavigationProbe || !session.options.enableClick) return;

  session.progress = "导航探测（顶栏路由 → 侧栏菜单）…";
  touch(session);
  markPhase(session, PhaseName.Navigation, false);

  const navTargets = await collectNavTargets(page);
  const navItems = navTargets.filter((t) => t.component === "thy-nav-item");
  const scoredNav = sortClickTargets(navItems, session.options);

  for (const scored of scoredNav) {
    if (session.clicksTried >= session.options.maxClicks) break;
    if (!(await waitWhilePaused(session))) return;

    if (scored.skipReason === SkipReason.Blacklist) {
      session.clicksSkipped += 1;
      addClickAction(session, {
        pageUrl: page.url(),
        target: scored.target,
        outcome: ClickOutcome.Skipped,
        skipReason: SkipReason.Blacklist,
        score: scored.score,
        matchedRules: scored.matchedRules,
      });
      continue;
    }

    session.progress = `路由 ${scored.target.label}`;
    session.status = ScanStatus.Running;
    touch(session);

    const result = await tryClickTarget(page, scored.target);
    session.clicksTried += 1;

    addClickAction(session, {
      pageUrl: page.url(),
      target: scored.target,
      outcome: result.ok ? ClickOutcome.Success : ClickOutcome.Failed,
      score: scored.score,
      matchedRules: scored.matchedRules,
      error: result.error,
    });

    if (!result.ok) recordClickFailure(session, page.url(), scored.target, result.error);

    await page.waitForTimeout(session.options.clickDelayMs + session.options.postClickSettleMs);

    const menuTargets = (await collectNavTargets(page)).filter((t) => t.component === "thy-menu-item");
    const scoredMenus = sortClickTargets(menuTargets, session.options);

    for (const menuScored of scoredMenus) {
      if (session.clicksTried >= session.options.maxClicks) break;
      if (!(await waitWhilePaused(session))) return;

      if (menuScored.skipReason === SkipReason.Blacklist) {
        session.clicksSkipped += 1;
        addClickAction(session, {
          pageUrl: page.url(),
          target: menuScored.target,
          outcome: ClickOutcome.Skipped,
          skipReason: SkipReason.Blacklist,
          score: menuScored.score,
          matchedRules: menuScored.matchedRules,
        });
        continue;
      }

      session.progress = `${scored.target.label} › ${menuScored.target.label}`;
      touch(session);

      const menuResult = await tryClickTarget(page, menuScored.target);
      session.clicksTried += 1;

      addClickAction(session, {
        pageUrl: page.url(),
        target: menuScored.target,
        outcome: menuResult.ok ? ClickOutcome.Success : ClickOutcome.Failed,
        score: menuScored.score,
        matchedRules: menuScored.matchedRules,
        error: menuResult.error,
      });

      if (!menuResult.ok) {
        recordClickFailure(session, page.url(), menuScored.target, menuResult.error);
      }

      await page.waitForTimeout(session.options.clickDelayMs + session.options.postClickSettleMs);
    }
  }

  markPhase(session, PhaseName.Navigation, true);
  touch(session);
}
