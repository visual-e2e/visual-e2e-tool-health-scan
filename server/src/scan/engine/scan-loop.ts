import type { Page } from "playwright";
import {
  ClickOutcome,
  FailureCode,
  IssueCategory,
  IssueSeverity,
  PhaseName,
  ScanStatus,
  ScopeType,
  getDefaultProbeSelectors,
  resolveProbeSelectors,
} from "../../types.js";
import {
  addClickAction,
  addIssue,
  markPhase,
  nowIso,
  recordClickFailure,
  touch,
  upsertInteractionRegistry,
  type ActiveScan,
} from "../session-context.js";
import { captureFailureScreenshot } from "../../report/artifact-writer.js";
import { classifyClickFailure } from "../../report/issue-classifier.js";
import { capturePageFingerprint, fingerprintsDiffer } from "../utils/page-fingerprint.js";
import { sleep } from "../utils/sleep.js";
import { collectAllEventEntries } from "./entry-collection.js";
import { EventTable } from "./event-table.js";
import { applyRegistryScoring } from "./registry-scorer.js";
import { isNavigationEntry } from "./nav-utils.js";
import {
  classifyMutation,
  drainDomMutations,
  injectDomObserver,
  isElementAlive,
  waitForDomChange,
} from "./dom-observer.js";
import { closeTopOverlay } from "../probes/click/close.js";
import { tryClickTarget, tryHoverTarget } from "../probes/click/resolver.js";
import { tryRecoverFromFailure } from "../probes/click/recover.js";
import type { EventEntry, EventEntryDraft, Framework } from "../../../../core/types/event-entry.js";
import { RegistryStatus } from "../../../../core/enums/registry.js";
import { getTopOverlay, type PickContext } from "./scope-resolver.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanLoopOptions {
  maxClicks: number;
  maxClicksPerPage: number;
  framework: Framework;
  clickDelayMs: number;
  postClickSettleMs: number;
  listSampleSize: number;
  /** 等待 DOM 变化超时（ms），默认 3000 */
  domChangeTimeoutMs: number;
  enableFailureScreenshot: boolean;
  useFingerprint: boolean;
  executionMode: "strict_registry" | "smart_dedup";
  maxRoundsWithoutProgress: number;
}

interface ExecuteResult {
  outcome: ClickOutcome;
  error?: string;
  failureCode?: FailureCode;
  screenshotPath?: string;
}

function upsertRegistryFromEntries(
  session: ActiveScan,
  entries: EventEntry[],
): void {
  for (const entry of entries) {
    upsertRegistryFromEntry(session, entry);
  }
}

function upsertRegistryFromEntry(
  session: ActiveScan,
  entry: EventEntry,
  lastResult?: string,
): void {
  upsertInteractionRegistry(session, {
    id: entry.targetId,
    label: entry.text || entry.tagName,
    selector: entry.selector,
    eventType: entry.eventTypes[0] ?? "click",
    layer: entry.layer,
    source: entry.sources[0] ?? "unknown",
    scopeType: entry.scopeType,
    scopeId: entry.scopeId,
    status: entry.status,
    lastResult: lastResult ?? entry.status,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

/**
 * 将 EventEntry 转换为 ClickTargetIdentity 兼容的对象，供 resolver 使用。
 * resolver 依赖 selector 和 position，其他字段补充默认值。
 */
function entryToIdentity(entry: EventEntry) {
  const scopeType = entry.scopeType === "overlay" ? ScopeType.Overlay : ScopeType.Page;
  return {
    targetId: entry.targetId,
    label: entry.text || entry.tagName,
    tag: entry.tagName,
    role: "unknown" as const,
    component: undefined,
    elementId: entry.selector.startsWith("#") ? entry.selector.slice(1) : undefined,
    position: entry.rect,
    scope: { type: scopeType, layer: entry.layer },
    locatorHints: undefined,
    matchContext: undefined,
    anchors: undefined,
  };
}

async function tryScopedInteraction(
  page: Page,
  entry: EventEntry,
  isHover: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (entry.overlaySelector) {
    const scoped = page.locator(`${entry.overlaySelector} ${entry.selector}`).first();
    const visible = await scoped.isVisible().catch(() => false);
    if (visible) {
      try {
        await scoped.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
        if (isHover) {
          await scoped.hover({ timeout: 2500 });
        } else {
          await scoped.click({ timeout: 2500 });
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  const identity = entryToIdentity(entry);
  return isHover
    ? tryHoverTarget(page, identity as Parameters<typeof tryHoverTarget>[1])
    : tryClickTarget(page, identity as Parameters<typeof tryClickTarget>[1]);
}

/**
 * 执行单个事件条目（点击或 hover）。永不抛出异常。
 */
async function executeEntry(
  entry: EventEntry,
  page: Page,
  session: ActiveScan,
  opts: Pick<ScanLoopOptions, "enableFailureScreenshot" | "useFingerprint" | "postClickSettleMs">,
): Promise<ExecuteResult> {
  try {
    const probe = session.options.probeSelectors ?? getDefaultProbeSelectors();
    const resolved = resolveProbeSelectors(probe);
    const isHover = entry.eventTypes[0] === "mouseenter" || entry.eventTypes[0] === "mouseover";

    const beforeFp =
      !isHover && opts.useFingerprint
        ? await capturePageFingerprint(page, resolved.overlay)
        : null;

    let result = await tryScopedInteraction(page, entry, isHover);

    let failureCode = result.ok ? undefined : classifyClickFailure(result.error);

    // 失败恢复重试
    if (!result.ok && failureCode) {
      const recovered = await tryRecoverFromFailure(page, failureCode, probe);
      if (recovered) {
        result = await tryScopedInteraction(page, entry, isHover);
        failureCode = result.ok ? undefined : classifyClickFailure(result.error);
      }
    }

    // 指纹检查（点击后无变化 → 标记为 NoVisibleEffect）
    if (result.ok && beforeFp) {
      await page.waitForTimeout(opts.postClickSettleMs);
      const afterFp = await capturePageFingerprint(page, resolved.overlay);
      if (!fingerprintsDiffer(beforeFp, afterFp)) {
        result = { ok: false, error: "点击后页面无明显变化" };
        failureCode = FailureCode.NoVisibleEffect;
      }
    }

    // 截图（失败时）
    let screenshotPath: string | undefined;
    if (!result.ok && opts.enableFailureScreenshot && session.page) {
      screenshotPath = await captureFailureScreenshot(
        page,
        session.profileId || session.projectId,
        session.reportId || session.id,
        entry.targetId,
      );
    }

    return {
      outcome: result.ok ? ClickOutcome.Success : ClickOutcome.Failed,
      error: result.error,
      failureCode,
      screenshotPath,
    };
  } catch (err) {
    return {
      outcome: ClickOutcome.Failed,
      error: err instanceof Error ? err.message : String(err),
      failureCode: FailureCode.UnresolvedTarget,
    };
  }
}

// ---------------------------------------------------------------------------
// Main scan loop
// ---------------------------------------------------------------------------

export async function runScanLoop(
  session: ActiveScan,
  page: Page,
  opts: ScanLoopOptions,
): Promise<void> {
  markPhase(session, PhaseName.Click, false);

  const table = new EventTable(opts.listSampleSize);
  /** 同一语义操作只点一次（无论 executionMode） */
  const globalExecuted = new Set<string>();
  const dedupEnabled = true;
  let roundsWithoutProgress = 0;
  let pageClickCount = 0;
  let pageKey = pageUrlKey(page.url());

  // 注入 DOM 观察者
  await injectDomObserver(page).catch(() => undefined);

  // 初次全量采集
  session.progress = "采集页面事件表…";
  touch(session);

  const probe = session.options.probeSelectors ?? getDefaultProbeSelectors();
  const resolvedProbe = resolveProbeSelectors(probe);

  const initialTopOverlay = await getTopOverlay(page, resolvedProbe);
  const initialDrafts = await collectAllEventEntries(page, opts.framework, probe).catch(() => []);
  const addedInitial = ingestDrafts(session, table, initialDrafts, initialTopOverlay);

  logInfo(session, `[engine] 初始事件表 ${addedInitial.length} 条 (layer=0, probe补采已合并)`);

  const pickCtx: PickContext = {
    globalExecuted,
    applySemanticDedup: dedupEnabled,
    schedule: {
      clickPolicy: session.options.clickPolicy,
      defaultWeight: session.options.defaultWeight,
      navOnly: false,
    },
  };

  function syncPageBudget(): void {
    const key = pageUrlKey(page.url());
    if (key !== pageKey) {
      pageKey = key;
      pageClickCount = 0;
    }
    pickCtx.schedule.navOnly = pageClickCount >= opts.maxClicksPerPage;
  }

  async function syncScopeAndPick(): Promise<EventEntry | undefined> {
    syncPageBudget();
    let topOverlay = await getTopOverlay(page, resolvedProbe);
    const scopeChanged = table.reconcileScope(topOverlay);
    for (const e of scopeChanged) {
      upsertRegistryFromEntry(session, e);
    }

    let entry = table.nextPending(topOverlay, pickCtx);
    if (!entry && topOverlay && !table.hasOverlayPending()) {
      const closed = await closeTopOverlay(
        page,
        resolvedProbe.overlayClose,
        resolvedProbe.overlay,
        resolvedProbe.overlayTitle,
      );
      if (!closed) {
        addIssue(session, {
          category: IssueCategory.Click,
          severity: IssueSeverity.Warning,
          title: "浮层关闭失败",
          detail: "弹框内操作已耗尽，但未能关闭",
          pageUrl: page.url(),
          failureCode: FailureCode.OverlayCloseFailed,
        });
      } else {
        topOverlay = await getTopOverlay(page, resolvedProbe);
        const restored = table.reconcileScope(topOverlay);
        for (const e of restored) {
          upsertRegistryFromEntry(session, e);
        }
        entry = table.nextPending(topOverlay, pickCtx);
      }
    }
    return entry;
  }

  // -------------------------------------------------------------------------
  // 主循环
  // -------------------------------------------------------------------------
  while (!session.abort && session.clicksTried < opts.maxClicks) {
    // ① 暂停检查
    if (!(await waitWhilePaused(session))) return;

    // ② 取下一个待执行条目（overlay 优先）
    let entry = await syncScopeAndPick();

    // ③ 没有可执行的 → 等待 DOM 变化
    if (!entry) {
      // 语义去重：把已执行过同 semanticId 的 pending 标为 skipped
      for (const e of table.pendingEntries()) {
        if (!globalExecuted.has(e.semanticId)) continue;
        table.markExecuted(e.targetId);
        upsertInteractionRegistry(session, {
          id: e.targetId,
          label: e.text || e.tagName,
          selector: e.selector,
          eventType: e.eventTypes[0] ?? "click",
          layer: e.layer,
          source: e.sources[0] ?? "unknown",
          scopeType: e.scopeType,
          scopeId: e.scopeId,
          status: RegistryStatus.Skipped,
          lastResult: "semantic-dedup",
        });
      }

      // 单页预算耗尽：非导航 pending 不再执行
      if (pickCtx.schedule.navOnly) {
        for (const e of table.pendingEntries()) {
          if (isNavigationEntry(e)) continue;
          table.markExecuted(e.targetId);
          upsertInteractionRegistry(session, {
            id: e.targetId,
            label: e.text || e.tagName,
            selector: e.selector,
            eventType: e.eventTypes[0] ?? "click",
            layer: e.layer,
            source: e.sources[0] ?? "unknown",
            scopeType: e.scopeType,
            scopeId: e.scopeId,
            status: RegistryStatus.Skipped,
            lastResult: "page-budget",
          });
        }
      }

      const staled = await table.prune(page);
      for (const s of staled) {
        upsertRegistryFromEntry(session, s);
      }

      const remainingAfterCleanup = table.remainingCount();
      if (remainingAfterCleanup === 0) {
        roundsWithoutProgress += 1;
      } else {
        roundsWithoutProgress = 0;
      }

      logInfo(session, `[engine] 当前无可执行条目，等待 DOM 变化 (${opts.domChangeTimeoutMs}ms)…`);
      session.progress = "等待页面变化…";
      touch(session);

      const changed = await waitForDomChange(page, opts.domChangeTimeoutMs);
      if (!changed) {
        if (
          table.remainingCount() === 0 ||
          roundsWithoutProgress >= opts.maxRoundsWithoutProgress
        ) {
          logInfo(
            session,
            `[engine] 等待超时，扫描结束 remaining=${table.remainingCount()} idleRounds=${roundsWithoutProgress}`,
          );
          break;
        }
        logInfo(
          session,
          `[engine] 等待超时但仍有 remaining=${table.remainingCount()}，继续尝试`,
        );
        continue;
      }

      roundsWithoutProgress = 0;
      const mutations = await drainDomMutations(page);
      const level = classifyMutation(mutations);
      await refreshEventTable(session, page, table, opts, level, probe, resolvedProbe);
      continue;
    }

    // ④ 检查元素是否还在 DOM
    const alive = await isElementAlive(page, entry.selector);
    if (!alive) {
      table.markStale(entry.targetId);
      entry.status = RegistryStatus.Stale;
      upsertRegistryFromEntry(session, entry);
      continue;
    }

    const label = entry.text || entry.tagName;
    const evType = entry.eventTypes[0] ?? "click";
    const scopeHint = entry.scopeType === "overlay" ? "[弹框]" : "";
    session.progress = `[层${entry.layer}]${scopeHint} ${evType} ${label} (${session.clicksTried + 1}/${opts.maxClicks})`;
    session.status = ScanStatus.Running;
    touch(session);

    const result = await executeEntry(entry, page, session, {
      enableFailureScreenshot: opts.enableFailureScreenshot,
      useFingerprint: opts.useFingerprint,
      postClickSettleMs: opts.postClickSettleMs,
    });

    // ⑥ 记录结果：语义去重始终写入，避免同类操作反复点击
    globalExecuted.add(entry.semanticId);
    table.markExecuted(entry.targetId);
    session.clicksTried += 1;
    pageClickCount += 1;
    entry.status = RegistryStatus.Executed;
    upsertRegistryFromEntry(session, entry, result.outcome);

    addClickAction(session, {
      pageUrl: page.url(),
      target: entryToIdentity(entry) as Parameters<typeof addClickAction>[1]["target"],
      outcome: result.outcome,
      score: entry.score ?? entry.priority,
      matchedRules: entry.matchedRules ?? [],
      error: result.error,
      failureCode: result.failureCode,
      screenshotPath: result.screenshotPath,
    });

    if (result.outcome === ClickOutcome.Failed && result.failureCode !== FailureCode.NoVisibleEffect) {
      recordClickFailure(
        session,
        page.url(),
        entryToIdentity(entry) as Parameters<typeof recordClickFailure>[2],
        result.error,
        result.failureCode,
        result.screenshotPath,
      );
    }

    logInfo(
      session,
      `[engine] ${result.outcome} [层${entry.layer}] ${evType} "${label}" | tried=${session.clicksTried}`,
    );

    // ⑦ 读取 DOM 变化，决定事件表更新策略
    await page.waitForTimeout(opts.clickDelayMs);
    await closeExtraTabs(session, page);
    await ensureSameOrigin(session, page);
    syncPageBudget();

    const mutations = await drainDomMutations(page);
    const level = classifyMutation(mutations);

    if (level !== "none") {
      await refreshEventTable(session, page, table, opts, level, probe, resolvedProbe);
    }

    // ⑧ 暂停检查
    if (!(await waitWhilePaused(session))) return;
  }

  logInfo(
    session,
    `[engine] 扫描循环结束 tried=${session.clicksTried} | 事件表: ${JSON.stringify(table.stats())}`,
  );

  markPhase(session, PhaseName.Click, true);
  touch(session);
}

function ingestDrafts(
  session: ActiveScan,
  table: EventTable,
  drafts: EventEntryDraft[],
  topOverlay: Awaited<ReturnType<typeof getTopOverlay>>,
): EventEntry[] {
  const added = table.add(drafts, topOverlay);
  const skipped = applyRegistryScoring(added, session.options);
  upsertRegistryFromEntries(session, added);
  for (const entry of skipped) {
    upsertRegistryFromEntry(session, entry, "blacklist");
  }
  const scopeChanged = table.reconcileScope(topOverlay);
  for (const entry of scopeChanged) {
    upsertRegistryFromEntry(session, entry);
  }
  return added;
}

async function refreshEventTable(
  session: ActiveScan,
  page: Page,
  table: EventTable,
  opts: Pick<ScanLoopOptions, "framework">,
  level: ReturnType<typeof classifyMutation>,
  probe: ReturnType<typeof getDefaultProbeSelectors>,
  resolvedProbe: ReturnType<typeof resolveProbeSelectors>,
): Promise<void> {
  table.nextLayer();
  const newLayer = table.currentLayer;
  const topOverlay = await getTopOverlay(page, resolvedProbe);

  if (level === "full") {
    logInfo(session, `[engine] 路由级 DOM 变化，重建事件表 (layer=${newLayer})`);
    table.clear();
    await injectDomObserver(page).catch(() => undefined);
    const drafts = await collectAllEventEntries(page, opts.framework, probe).catch(() => []);
    const added = ingestDrafts(session, table, drafts, topOverlay);
    logInfo(session, `[engine] 重建后事件表 ${added.length} 条`);
    return;
  }

  logInfo(session, `[engine] 局部 DOM 变化，增量更新 (layer=${newLayer})`);
  const beforeSize = table.size;
  const drafts = await collectAllEventEntries(page, opts.framework, probe).catch(() => []);
  ingestDrafts(session, table, drafts, topOverlay);
  const addedCount = table.size - beforeSize;
  const staled = await table.prune(page);
  for (const s of staled) {
    upsertRegistryFromEntry(session, s);
  }
  logInfo(
    session,
    `[engine] 增量 +${addedCount} stale=${staled.length} total=${table.size} overlay=${topOverlay ? "open" : "closed"}`,
  );
}

// ---------------------------------------------------------------------------
// Log helper
// ---------------------------------------------------------------------------

function logInfo(session: ActiveScan, msg: string): void {
  session.progress = msg;
  touch(session);
  console.log(`${nowIso()} ${msg}`);
}

function pageUrlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
