import { randomUUID } from "node:crypto";
import { bootstrapHostPaths } from "../host-paths.js";
import { resolveBrowserLaunch } from "../resolve-browser.js";
import { attemptAutoLogin } from "../auth/auto-login.js";
import { saveReportFromSession } from "../report/report-store.js";
import { touchProfileAfterScan, resolveProfileScanOptions } from "../profile/profile-store.js";
import { ensureArtifactsDir, captureRouteScreenshot } from "../report/artifact-writer.js";
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
import { attachCollectors, resolveIgnoreRequestRules, runNetworkSnapshot } from "./collectors/network.js";
import { runLayoutProbe } from "./probes/layout.js";
import { runNavigationProbe } from "./probes/navigation.js";
import { runHoverProbe } from "./probes/hover.js";
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
  if (options.enableClick && options.enableHoverProbe) {
    phases.push({ name: PhaseName.Hover, label: "悬停探测", done: false });
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
    enableHoverProbe: input.enableHoverProbe ?? DEFAULT_SCAN_OPTIONS.enableHoverProbe,
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
    ignoreRequestRules: Array.isArray(input.ignoreRequestRules)
      ? input.ignoreRequestRules
      : [...DEFAULT_SCAN_OPTIONS.ignoreRequestRules],
    clickExclude: input.clickExclude,
    autoLoginEnabled: input.autoLoginEnabled ?? DEFAULT_SCAN_OPTIONS.autoLoginEnabled,
    loginProfile: input.loginProfile,
    loginSelectors: {
      ...DEFAULT_SCAN_OPTIONS.loginSelectors,
      ...input.loginSelectors,
    },
    enableRecording: input.enableRecording ?? DEFAULT_SCAN_OPTIONS.enableRecording,
    enableFailureScreenshot:
      input.enableFailureScreenshot ?? DEFAULT_SCAN_OPTIONS.enableFailureScreenshot,
    enableRouteScreenshot:
      input.enableRouteScreenshot ?? DEFAULT_SCAN_OPTIONS.enableRouteScreenshot,
    clickSuccessMode: input.clickSuccessMode ?? DEFAULT_SCAN_OPTIONS.clickSuccessMode,
    probeSelectors: input.probeSelectors ?? DEFAULT_SCAN_OPTIONS.probeSelectors,
  };
}

async function runScan(session: ActiveScan): Promise<void> {
  try {
    session.status = ScanStatus.Starting;
    session.progress = "启动浏览器…";
    touch(session);

    bootstrapHostPaths({
      hostRuntime: session.hostRuntime,
      hostDataDir: session.hostDataDir,
    });

    const launch = await resolveBrowserLaunch(session.hostRuntime);
    if (!launch.ok) {
      throw new Error(launch.hints.join("; ") || "浏览器未就绪");
    }

    if (session.options.enableRecording && !launch.env.PLAYWRIGHT_BROWSERS_PATH?.trim()) {
      throw new Error("录屏需要 ffmpeg，请先在主应用安装浏览器运行时");
    }

    // Playwright resolves ffmpeg via process.env.PLAYWRIGHT_BROWSERS_PATH
    // (same as Host / scenario-recorder), not via chromium.launch({ env }).
    for (const [key, value] of Object.entries(launch.env)) {
      process.env[key] = value;
    }

    const { chromium } = await import("playwright");

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
      recordVideo: session.options.enableRecording
        ? { dir: await ensureArtifactsDir(session.id), size: launch.settings.viewport }
        : undefined,
    });
    session.context = context;
    session.artifactsDir = await ensureArtifactsDir(session.id);
    context.setDefaultTimeout(launch.settings.timeout);
    context.setDefaultNavigationTimeout(launch.settings.timeout);

    const page = await context.newPage();
    session.page = page;

    if (session.options.enableRouteScreenshot) {
      let lastRouteKey = "";
      let routeSeq = 0;
      page.on("framenavigated", (frame) => {
        if (frame !== page.mainFrame()) return;
        void (async () => {
          try {
            const url = page.url();
            let key = url;
            try {
              const u = new URL(url);
              key = `${u.origin}${u.pathname}${u.search}`;
            } catch {
              // keep raw
            }
            if (!key || key === lastRouteKey) return;
            lastRouteKey = key;
            routeSeq += 1;
            await captureRouteScreenshot(page, session.id, routeSeq);
            session.currentUrl = url;
            touch(session);
          } catch {
            // ignore screenshot errors
          }
        })();
      });
    }

    const ignoreRules = resolveIgnoreRequestRules(session.options);
    attachCollectors(session, page, ignoreRules);

    session.progress = "打开入口页…";
    touch(session);
    markPhase(session, PhaseName.Navigate, false);

    await page.goto(session.options.startUrl, { waitUntil: "domcontentloaded" });
    session.currentUrl = page.url();
    await page.waitForTimeout(session.options.settleMs);
    markPhase(session, PhaseName.Navigate, true);

    if (session.options.autoLoginEnabled && session.options.loginProfile) {
      session.progress = "尝试自动登录…";
      touch(session);
      const loginResult = await attemptAutoLogin(
        page,
        session.options.loginProfile,
        session.options.loginSelectors,
      );
      session.progress = loginResult.message;
      touch(session);
      if (loginResult.ok) {
        session.currentUrl = page.url();
      }
    }

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

    if (session.options.enableClick && session.options.enableHoverProbe) {
      if (!(await waitWhilePaused(session))) {
        session.status = ScanStatus.Cancelled;
        return;
      }
      await runHoverProbe(session, page);
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
    if (session.page && session.context && session.options.enableRecording) {
      const video = session.page.video();
      if (video) {
        try {
          const videoPath = await video.path();
          session.videoPath = videoPath;
        } catch {
          // video may not be ready yet
        }
      }
    }
    touch(session);

    if (
      session.status === ScanStatus.Done ||
      session.status === ScanStatus.Cancelled ||
      session.status === ScanStatus.Error
    ) {
      try {
        const view = toView(session);
        const meta = await saveReportFromSession(view, {
          profileId: session.profileId,
        });
        session.reportId = meta.id;
        if (meta.videoPath) session.videoPath = meta.videoPath;
        if (session.profileId) {
          await touchProfileAfterScan(session.profileId, view.summary);
        }
      } catch (err) {
        console.error("[health-scan] save report failed", err);
      }
    }

    await cleanupBrowser(session);
  }
}

export async function createScan(
  input: Partial<ScanOptions> & {
    startUrl?: string;
    profileId?: string;
    hostRuntime?: ActiveScan["hostRuntime"];
    hostDataDir?: ActiveScan["hostDataDir"];
  },
): Promise<ReturnType<typeof toView>> {
  let resolvedInput = input;
  if (input.profileId) {
    const fromProfile = await resolveProfileScanOptions(input.profileId);
    resolvedInput = { ...fromProfile, profileId: input.profileId };
  }

  const startUrl = resolvedInput.startUrl?.trim();
  if (!startUrl) throw new Error("startUrl 不能为空");

  const options = normalizeOptions({ ...resolvedInput, startUrl });
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
    profileId: input.profileId,
    hostRuntime: input.hostRuntime,
    hostDataDir: input.hostDataDir,
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
