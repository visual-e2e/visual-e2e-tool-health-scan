import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { resolveBrowserLaunch } from "../resolve-browser.js";
import {
  DEFAULT_SCAN_OPTIONS,
  getDefaultBlacklistConfig,
  getDefaultWhitelistConfig,
  PhaseName,
  RuleOp,
  RuleType,
  ScanStatus,
  type ClickRuleConfig,
  type ScanOptions,
  type ScanPhase,
} from "../types.js";
import { attachCollectors, compileUrlExcludes, runNetworkSnapshot } from "./collectors/network.js";
import { runLayoutProbe } from "./probes/layout.js";
import { runNavigationProbe } from "./probes/navigation.js";
import { runClickProbe } from "./probes/click/executor.js";
import {
  markPhase,
  nowIso,
  toView,
  touch,
  type ActiveScan,
} from "./session-context.js";
import { waitUntilStable } from "./utils/stable-wait.js";
import { sleep } from "./utils/sleep.js";

const sessions = new Map<string, ActiveScan>();

async function waitUntilReadyToScan(session: ActiveScan): Promise<boolean> {
  session.status = ScanStatus.Ready;
  session.progress = "浏览器已就绪，请登录或切到目标页后点击「开始扫描」";
  touch(session);

  while (!session.abort) {
    if (session.status !== ScanStatus.Ready) break;
    if (session.page && !session.page.isClosed()) {
      try {
        const url = session.page.url();
        if (url && url !== session.currentUrl) {
          session.currentUrl = url;
          touch(session);
        }
      } catch {
        // page may be navigating
      }
    }
    await sleep(400);
  }

  if (session.abort) return false;
  const status: string = session.status;
  return status === ScanStatus.Running || status === ScanStatus.Paused;
}

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

async function cleanupBrowser(session: ActiveScan): Promise<void> {
  const browser = session.browser;
  session.page = null;
  session.context = null;
  session.browser = null;
  if (browser) await browser.close().catch(() => undefined);
}

function buildPhases(options: ScanOptions): ScanPhase[] {
  const phases: ScanPhase[] = [
    { name: PhaseName.Navigate, label: "打开页面", done: false },
    { name: PhaseName.Awaiting, label: "等待登录/就绪", done: false },
  ];
  if (options.enableNetwork) {
    phases.push({ name: PhaseName.Network, label: "网络监听", done: false });
    phases.push({ name: PhaseName.NetworkSnapshot, label: "资源审计", done: false });
  }
  if (options.enableLayout) phases.push({ name: PhaseName.Layout, label: "布局检测", done: false });
  if (options.enableClick && options.enableNavigationProbe) {
    phases.push({ name: PhaseName.Navigation, label: "导航探测", done: false });
  }
  if (options.enableClick) phases.push({ name: PhaseName.Click, label: "交互检查", done: false });
  return phases;
}

function resolveRuleConfig(input: Partial<ScanOptions>): {
  blacklistRules: ClickRuleConfig[];
  whitelistRules: ClickRuleConfig[];
  whitelistDefaultWeight: number;
} {
  if (Array.isArray(input.blacklistRules) && Array.isArray(input.whitelistRules)) {
    return {
      blacklistRules: input.blacklistRules,
      whitelistRules: input.whitelistRules,
      whitelistDefaultWeight:
        input.whitelistDefaultWeight ?? DEFAULT_SCAN_OPTIONS.whitelistDefaultWeight,
    };
  }

  const excludes = input.clickExclude ?? [];
  const blacklist = getDefaultBlacklistConfig();
  if (excludes.length > 0) {
    blacklist.unshift({
      id: 9_999_999,
      title: "legacy clickExclude",
      type: RuleType.Text,
      op: RuleOp.Contains,
      values: excludes,
      description: "legacy clickExclude",
    });
  }
  const wl = getDefaultWhitelistConfig();
  return {
    blacklistRules: blacklist,
    whitelistRules: wl.rules,
    whitelistDefaultWeight: wl.defaultWeight,
  };
}

export function normalizeOptions(input: Partial<ScanOptions> & { startUrl: string }): ScanOptions {
  const startUrl = input.startUrl.trim();
  if (!startUrl) throw new Error("startUrl 不能为空");
  try {
    void new URL(startUrl);
  } catch {
    throw new Error("startUrl 不是合法 URL");
  }

  const rules = resolveRuleConfig(input);

  return {
    startUrl,
    enableNetwork: input.enableNetwork ?? DEFAULT_SCAN_OPTIONS.enableNetwork,
    enableLayout: input.enableLayout ?? DEFAULT_SCAN_OPTIONS.enableLayout,
    enableClick: input.enableClick ?? DEFAULT_SCAN_OPTIONS.enableClick,
    enableNavigationProbe:
      input.enableNavigationProbe ?? DEFAULT_SCAN_OPTIONS.enableNavigationProbe,
    maxClicks: Math.max(1, Number(input.maxClicks ?? DEFAULT_SCAN_OPTIONS.maxClicks)),
    maxOverlayDepth: Math.max(
      1,
      Math.min(10, Number(input.maxOverlayDepth ?? DEFAULT_SCAN_OPTIONS.maxOverlayDepth)),
    ),
    clickDelayMs: Math.max(
      100,
      Math.min(5000, Number(input.clickDelayMs ?? DEFAULT_SCAN_OPTIONS.clickDelayMs)),
    ),
    postClickSettleMs: Math.max(
      0,
      Math.min(5000, Number(input.postClickSettleMs ?? DEFAULT_SCAN_OPTIONS.postClickSettleMs)),
    ),
    settleMs: Math.max(0, Math.min(10_000, Number(input.settleMs ?? DEFAULT_SCAN_OPTIONS.settleMs))),
    networkIdleMs: Math.max(
      0,
      Math.min(5000, Number(input.networkIdleMs ?? DEFAULT_SCAN_OPTIONS.networkIdleMs)),
    ),
    consecutiveErrorLimit: Math.max(
      1,
      Math.min(20, Number(input.consecutiveErrorLimit ?? DEFAULT_SCAN_OPTIONS.consecutiveErrorLimit)),
    ),
    refreshOnConsecutiveErrors:
      input.refreshOnConsecutiveErrors ?? DEFAULT_SCAN_OPTIONS.refreshOnConsecutiveErrors,
    clickPolicy: input.clickPolicy ?? DEFAULT_SCAN_OPTIONS.clickPolicy,
    defaultWeight: Number(input.defaultWeight ?? DEFAULT_SCAN_OPTIONS.defaultWeight),
    blacklistRules: rules.blacklistRules,
    whitelistRules: rules.whitelistRules,
    whitelistDefaultWeight: rules.whitelistDefaultWeight,
    clickSortTolerancePx: Math.max(
      1,
      Math.min(32, Number(input.clickSortTolerancePx ?? DEFAULT_SCAN_OPTIONS.clickSortTolerancePx)),
    ),
    apiErrorMinStatus:
      input.apiErrorMinStatus === 400 ? 400 : DEFAULT_SCAN_OPTIONS.apiErrorMinStatus,
    urlExclude: Array.isArray(input.urlExclude)
      ? input.urlExclude.map(String)
      : [...DEFAULT_SCAN_OPTIONS.urlExclude],
    clickExclude: input.clickExclude,
  };
}

async function runScan(session: ActiveScan): Promise<void> {
  try {
    session.status = ScanStatus.Starting;
    session.progress = "启动浏览器…";
    touch(session);

    const launch = await resolveBrowserLaunch();
    if (!launch.ok) {
      throw new Error(launch.hints.join("; ") || "浏览器未就绪");
    }

    const browser = await chromium.launch({
      headless: launch.settings.headless,
      slowMo: launch.settings.slowMo,
      executablePath: launch.executablePath,
      env: { ...process.env, ...launch.env },
    });
    session.browser = browser;

    const context = await browser.newContext({
      viewport: launch.settings.viewport,
      locale: "zh-CN",
    });
    session.context = context;
    context.setDefaultTimeout(launch.settings.timeout);
    context.setDefaultNavigationTimeout(launch.settings.timeout);

    const page = await context.newPage();
    session.page = page;

    const excludes = compileUrlExcludes(session.options);
    attachCollectors(session, page, excludes);

    session.progress = "打开入口页…";
    touch(session);
    markPhase(session, PhaseName.Navigate, false);

    await page.goto(session.options.startUrl, { waitUntil: "domcontentloaded" });
    session.currentUrl = page.url();
    await page.waitForTimeout(session.options.settleMs);
    markPhase(session, PhaseName.Navigate, true);

    if (session.abort) {
      session.status = ScanStatus.Cancelled;
      return;
    }

    const started = await waitUntilReadyToScan(session);
    if (!started) {
      session.status = ScanStatus.Cancelled;
      return;
    }

    session.collecting = true;
    markPhase(session, PhaseName.Awaiting, true);
    if (session.options.enableNetwork) markPhase(session, PhaseName.Network, true);
    session.pauseRequested = false;
    session.status = ScanStatus.Running;
    session.progress = "开始扫描…";
    touch(session);

    await waitUntilStable(page, {
      settleMs: session.options.settleMs,
      networkIdleMs: session.options.networkIdleMs,
    });

    if (session.options.enableNetwork) {
      if (!(await waitWhilePaused(session))) {
        session.status = ScanStatus.Cancelled;
        return;
      }
      await runNetworkSnapshot(session, page);
    }

    if (session.options.enableLayout) {
      if (!(await waitWhilePaused(session))) {
        session.status = ScanStatus.Cancelled;
        return;
      }
      await runLayoutProbe(session, page);
    }

    if (session.abort) {
      session.status = ScanStatus.Cancelled;
      return;
    }

    if (session.options.enableClick && session.options.enableNavigationProbe) {
      if (!(await waitWhilePaused(session))) {
        session.status = ScanStatus.Cancelled;
        return;
      }
      await runNavigationProbe(session, page);
    }

    if (session.options.enableClick) {
      if (!(await waitWhilePaused(session))) {
        session.status = ScanStatus.Cancelled;
        return;
      }
      await runClickProbe(session, page);
    }

    if (session.abort) {
      session.status = ScanStatus.Cancelled;
    } else {
      session.status = ScanStatus.Done;
      session.progress = "扫描完成";
    }
  } catch (err) {
    session.status = ScanStatus.Error;
    session.error = err instanceof Error ? err.message : String(err);
    session.progress = undefined;
  } finally {
    touch(session);
    await cleanupBrowser(session);
  }
}

export async function createScan(
  input: Partial<ScanOptions> & { startUrl: string },
): Promise<ReturnType<typeof toView>> {
  const options = normalizeOptions(input);
  const id = randomUUID();
  const now = nowIso();
  const session: ActiveScan = {
    id,
    status: ScanStatus.Starting,
    startUrl: options.startUrl,
    currentUrl: options.startUrl,
    options,
    phases: buildPhases(options),
    issues: new Map(),
    clickActions: [],
    clicksTried: 0,
    clicksSkipped: 0,
    startedAt: now,
    updatedAt: now,
    browser: null,
    context: null,
    page: null,
    abort: false,
    pauseRequested: false,
    collecting: false,
  };
  sessions.set(id, session);
  session.runPromise = runScan(session);
  return toView(session);
}

export function getScan(sessionId: string) {
  const session = sessions.get(sessionId);
  return session ? toView(session) : null;
}

export function startScan(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status !== ScanStatus.Ready) throw new Error("仅在「等待就绪」时可开始扫描");
  session.issues.clear();
  session.clickActions = [];
  session.clicksTried = 0;
  session.clicksSkipped = 0;
  session.collecting = true;
  session.status = ScanStatus.Running;
  session.progress = "开始扫描…";
  markPhase(session, PhaseName.Awaiting, true);
  if (session.options.enableNetwork) markPhase(session, PhaseName.Network, true);
  touch(session);
  return toView(session);
}

export function pauseScan(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status !== ScanStatus.Running) throw new Error("仅扫描中可暂停");
  session.pauseRequested = true;
  session.progress = "正在暂停…";
  touch(session);
  return toView(session);
}

export function resumeScan(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status !== ScanStatus.Paused && !session.pauseRequested) {
    throw new Error("当前未暂停");
  }
  session.pauseRequested = false;
  session.status = ScanStatus.Running;
  session.progress = "继续扫描…";
  touch(session);
  return toView(session);
}

export async function stopScan(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("会话不存在");
  if (
    session.status === ScanStatus.Done ||
    session.status === ScanStatus.Cancelled ||
    session.status === ScanStatus.Error
  ) {
    return toView(session);
  }
  session.abort = true;
  session.status = ScanStatus.Stopping;
  session.progress = "正在停止…";
  touch(session);
  await session.runPromise?.catch(() => undefined);
  if (session.status === ScanStatus.Stopping) session.status = ScanStatus.Cancelled;
  touch(session);
  return toView(session);
}

export async function deleteScan(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.abort = true;
  await session.runPromise?.catch(() => undefined);
  await cleanupBrowser(session);
  sessions.delete(sessionId);
}
