import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response } from "playwright";
import { resolveBrowserLaunch } from "./resolve-browser.js";
import {
  DEFAULT_SCAN_OPTIONS,
  type ScanIssue,
  type ScanOptions,
  type ScanPhase,
  type ScanSessionView,
  type ScanStatus,
} from "./types.js";

interface ActiveScan {
  id: string;
  status: ScanStatus;
  startUrl: string;
  currentUrl: string;
  options: ScanOptions;
  phases: ScanPhase[];
  issues: Map<string, ScanIssue>;
  clicksTried: number;
  progress?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  abort: boolean;
  runPromise?: Promise<void>;
}

const sessions = new Map<string, ActiveScan>();

function nowIso(): string {
  return new Date().toISOString();
}

function touch(session: ActiveScan): void {
  session.updatedAt = nowIso();
}

function issueKey(parts: Array<string | number | undefined>): string {
  return parts.map((p) => String(p ?? "")).join("|");
}

function addIssue(session: ActiveScan, issue: Omit<ScanIssue, "id" | "count" | "timestamp">): void {
  const key = issueKey([
    issue.category,
    issue.title,
    issue.pageUrl,
    issue.url,
    issue.status,
    issue.selector,
  ]);
  const existing = session.issues.get(key);
  if (existing) {
    existing.count += 1;
    existing.timestamp = nowIso();
    return;
  }
  session.issues.set(key, {
    ...issue,
    id: randomUUID(),
    count: 1,
    timestamp: nowIso(),
  });
}

function toView(session: ActiveScan): ScanSessionView {
  const issues = [...session.issues.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return {
    sessionId: session.id,
    status: session.status,
    startUrl: session.startUrl,
    currentUrl: session.currentUrl,
    options: session.options,
    phases: session.phases,
    issues,
    summary: {
      network: issues.filter((i) => i.category === "network").length,
      layout: issues.filter((i) => i.category === "layout").length,
      click: issues.filter((i) => i.category === "click").length,
      runtime: issues.filter((i) => i.category === "runtime").length,
      clicksTried: session.clicksTried,
    },
    progress: session.progress,
    error: session.error,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
  };
}

function markPhase(session: ActiveScan, name: ScanPhase["name"], done: boolean): void {
  const phase = session.phases.find((p) => p.name === name);
  if (phase) phase.done = done;
  touch(session);
}

function compileExcludes(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const raw of patterns) {
    const p = raw.trim();
    if (!p) continue;
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      // ignore invalid
    }
  }
  return out;
}

function isExcluded(url: string, excludes: RegExp[]): boolean {
  return excludes.some((re) => re.test(url));
}

const STATIC_TYPES = new Set(["stylesheet", "image", "font", "media", "script"]);
const API_TYPES = new Set(["xhr", "fetch"]);

function attachCollectors(session: ActiveScan, page: Page, excludes: RegExp[]): void {
  const onResponse = (res: Response) => {
    if (!session.options.enableNetwork) return;
    const req = res.request();
    const url = res.url();
    if (isExcluded(url, excludes)) return;
    const status = res.status();
    const resourceType = req.resourceType();
    const pageUrl = page.url();

    if (STATIC_TYPES.has(resourceType) && (status === 404 || status >= 500)) {
      addIssue(session, {
        category: "network",
        severity: "error",
        title: status === 404 ? "静态资源 404" : `静态资源 ${status}`,
        detail: `${resourceType} → ${status}`,
        pageUrl,
        url,
        status,
        resourceType,
      });
      touch(session);
      return;
    }

    if (API_TYPES.has(resourceType) && status >= 500) {
      addIssue(session, {
        category: "network",
        severity: "error",
        title: `接口 ${status}`,
        detail: `${req.method()} ${resourceType}`,
        pageUrl,
        url,
        status,
        resourceType,
      });
      touch(session);
    }
  };

  const onFailed = (req: Request) => {
    if (!session.options.enableNetwork) return;
    const url = req.url();
    if (isExcluded(url, excludes)) return;
    const resourceType = req.resourceType();
    if (!STATIC_TYPES.has(resourceType) && !API_TYPES.has(resourceType)) return;
    const failure = req.failure()?.errorText ?? "request failed";
    addIssue(session, {
      category: "network",
      severity: "error",
      title: "请求失败",
      detail: failure,
      pageUrl: page.url(),
      url,
      resourceType,
    });
    touch(session);
  };

  const onPageError = (err: Error) => {
    addIssue(session, {
      category: "runtime",
      severity: "error",
      title: "页面 JS 异常",
      detail: err.message,
      pageUrl: page.url(),
    });
    touch(session);
  };

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon\.ico/i.test(text)) return;
    addIssue(session, {
      category: "runtime",
      severity: "warning",
      title: "控制台 error",
      detail: text.slice(0, 500),
      pageUrl: page.url(),
    });
    touch(session);
  };

  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      session.currentUrl = page.url();
      touch(session);
    }
  });
}

async function runLayoutProbe(session: ActiveScan, page: Page): Promise<void> {
  session.progress = "检测页面布局…";
  touch(session);
  const pageUrl = page.url();

  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const findings: Array<{ title: string; detail: string; severity: "error" | "warning" }> = [];

    const scrollOverflow = doc.scrollWidth - doc.clientWidth;
    if (scrollOverflow > 24) {
      findings.push({
        title: "横向溢出",
        detail: `scrollWidth 超出 clientWidth ${scrollOverflow}px`,
        severity: "warning",
      });
    }

    const children = body ? body.children.length : 0;
    const bodyHeight = body?.getBoundingClientRect().height ?? 0;
    if (children <= 1 && bodyHeight < 80) {
      findings.push({
        title: "疑似白屏/空壳",
        detail: `body 子节点 ${children}，高度 ${Math.round(bodyHeight)}px`,
        severity: "error",
      });
    }

    const candidates = Array.from(
      document.querySelectorAll("a, button, [role='button'], input[type='button'], input[type='submit']"),
    ).slice(0, 40);

    let blocked = 0;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      if (top === el || el.contains(top) || top.contains(el)) continue;
      blocked += 1;
    }
    if (blocked >= 3) {
      findings.push({
        title: "可交互元素被遮挡",
        detail: `抽样发现 ${blocked} 个元素中心点被其它节点覆盖`,
        severity: "warning",
      });
    }

    return findings;
  });

  for (const f of result) {
    addIssue(session, {
      category: "layout",
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      pageUrl,
    });
  }
}

type ClickCandidate = { selector: string; text: string };

async function collectClickCandidates(
  page: Page,
  excludeTexts: string[],
): Promise<ClickCandidate[]> {
  return page.evaluate((excludes: string[]) => {
    const selectors = [
      "a[href]",
      "button:not([disabled])",
      "[role='button']",
      "input[type='button']:not([disabled])",
      "input[type='submit']:not([disabled])",
      ".ant-btn:not([disabled])",
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    const out: ClickCandidate[] = [];
    const seen = new Set<string>();

    const buildSelector = (el: Element): string => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
      const tag = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      const idx = siblings.indexOf(el) + 1;
      return `${buildSelector(parent)} > ${tag}:nth-of-type(${idx})`;
    };

    for (const el of nodes) {
      const html = el as HTMLElement;
      const style = window.getComputedStyle(html);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        continue;
      }
      const rect = html.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (html.getAttribute("aria-disabled") === "true") continue;
      if ((html as HTMLButtonElement).disabled) continue;

      const text = (html.innerText || html.getAttribute("aria-label") || html.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      if (excludes.some((t) => t && text.includes(t))) continue;

      let selector = "";
      try {
        selector = buildSelector(el);
      } catch {
        continue;
      }
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      out.push({ selector, text });
      if (out.length >= 80) break;
    }
    return out;
  }, excludeTexts);
}

async function snapshotSignal(page: Page): Promise<{
  url: string;
  title: string;
  bodyHash: string;
  childCount: number;
}> {
  return page.evaluate(() => {
    const body = document.body;
    const html = body?.innerHTML.slice(0, 4000) ?? "";
    let hash = 0;
    for (let i = 0; i < html.length; i += 1) hash = (hash * 31 + html.charCodeAt(i)) | 0;
    return {
      url: location.href,
      title: document.title,
      bodyHash: String(hash),
      childCount: body?.children.length ?? 0,
    };
  });
}

async function runClickProbe(session: ActiveScan, page: Page): Promise<void> {
  session.progress = "交互检查（点击探测）…";
  touch(session);

  const candidates = await collectClickCandidates(page, session.options.clickExclude);
  const max = Math.min(session.options.maxClicks, candidates.length);

  for (let i = 0; i < max; i += 1) {
    if (session.abort) return;
    const candidate = candidates[i]!;
    session.progress = `点击 ${i + 1}/${max}: ${candidate.text || candidate.selector}`;
    touch(session);

    const before = await snapshotSignal(page);
    const issuesBefore = session.issues.size;

    let clicked = false;
    try {
      const locator = page.locator(candidate.selector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
      await locator.click({ timeout: 2500, trial: false });
      clicked = true;
      session.clicksTried += 1;
    } catch (err) {
      addIssue(session, {
        category: "click",
        severity: "warning",
        title: "点击失败",
        detail: err instanceof Error ? err.message : String(err),
        pageUrl: page.url(),
        selector: candidate.selector,
      });
      touch(session);
      continue;
    }

    await page.waitForTimeout(session.options.clickDelayMs);
    if (session.abort) return;

    // Close extra tabs opened by click
    const pages = session.context?.pages() ?? [];
    for (const p of pages) {
      if (p !== page && !p.isClosed()) await p.close().catch(() => undefined);
    }

    const after = await snapshotSignal(page);
    const issuesAfter = session.issues.size;
    const changed =
      before.url !== after.url ||
      before.title !== after.title ||
      before.bodyHash !== after.bodyHash ||
      before.childCount !== after.childCount ||
      issuesAfter > issuesBefore;

    if (clicked && !changed) {
      addIssue(session, {
        category: "click",
        severity: "warning",
        title: "疑似失效点击",
        detail: candidate.text
          ? `点击「${candidate.text}」后无明显反馈`
          : "点击后无明显 URL/DOM/网络变化",
        pageUrl: before.url,
        selector: candidate.selector,
      });
      touch(session);
    }

    // Prefer stay on same origin; if navigated away from start host, go back
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
}

async function runScan(session: ActiveScan): Promise<void> {
  try {
    session.status = "starting";
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

    const excludes = compileExcludes(session.options.urlExclude);
    attachCollectors(session, page, excludes);

    session.status = "running";
    session.progress = "打开入口页…";
    touch(session);
    markPhase(session, "navigate", false);

    await page.goto(session.options.startUrl, { waitUntil: "domcontentloaded" });
    session.currentUrl = page.url();
    await page.waitForTimeout(session.options.settleMs);
    markPhase(session, "navigate", true);
    if (session.options.enableNetwork) markPhase(session, "network", true);

    if (session.abort) {
      session.status = "cancelled";
      return;
    }

    if (session.options.enableLayout) {
      markPhase(session, "layout", false);
      await runLayoutProbe(session, page);
      markPhase(session, "layout", true);
    }

    if (session.abort) {
      session.status = "cancelled";
      return;
    }

    if (session.options.enableClick) {
      markPhase(session, "click", false);
      await runClickProbe(session, page);
      markPhase(session, "click", true);
    }

    if (session.abort) {
      session.status = "cancelled";
    } else {
      session.status = "done";
      session.progress = "扫描完成";
    }
  } catch (err) {
    session.status = "error";
    session.error = err instanceof Error ? err.message : String(err);
    session.progress = undefined;
  } finally {
    touch(session);
    await cleanupBrowser(session);
  }
}

async function cleanupBrowser(session: ActiveScan): Promise<void> {
  const browser = session.browser;
  session.page = null;
  session.context = null;
  session.browser = null;
  if (browser) await browser.close().catch(() => undefined);
}

function buildPhases(options: ScanOptions): ScanPhase[] {
  const phases: ScanPhase[] = [{ name: "navigate", label: "打开页面", done: false }];
  if (options.enableNetwork) phases.push({ name: "network", label: "网络监听", done: false });
  if (options.enableLayout) phases.push({ name: "layout", label: "布局检测", done: false });
  if (options.enableClick) phases.push({ name: "click", label: "交互检查", done: false });
  return phases;
}

export function normalizeOptions(input: Partial<ScanOptions> & { startUrl: string }): ScanOptions {
  const startUrl = input.startUrl.trim();
  if (!startUrl) throw new Error("startUrl 不能为空");
  try {
    void new URL(startUrl);
  } catch {
    throw new Error("startUrl 不是合法 URL");
  }

  return {
    startUrl,
    enableNetwork: input.enableNetwork ?? DEFAULT_SCAN_OPTIONS.enableNetwork,
    enableLayout: input.enableLayout ?? DEFAULT_SCAN_OPTIONS.enableLayout,
    enableClick: input.enableClick ?? DEFAULT_SCAN_OPTIONS.enableClick,
    maxClicks: Math.max(1, Math.min(100, Number(input.maxClicks ?? DEFAULT_SCAN_OPTIONS.maxClicks))),
    clickDelayMs: Math.max(
      100,
      Math.min(5000, Number(input.clickDelayMs ?? DEFAULT_SCAN_OPTIONS.clickDelayMs)),
    ),
    settleMs: Math.max(0, Math.min(10_000, Number(input.settleMs ?? DEFAULT_SCAN_OPTIONS.settleMs))),
    urlExclude: Array.isArray(input.urlExclude)
      ? input.urlExclude.map(String)
      : [...DEFAULT_SCAN_OPTIONS.urlExclude],
    clickExclude: Array.isArray(input.clickExclude)
      ? input.clickExclude.map(String)
      : [...DEFAULT_SCAN_OPTIONS.clickExclude],
  };
}

export async function createScan(input: Partial<ScanOptions> & { startUrl: string }): Promise<ScanSessionView> {
  const options = normalizeOptions(input);
  const id = randomUUID();
  const now = nowIso();
  const session: ActiveScan = {
    id,
    status: "starting",
    startUrl: options.startUrl,
    currentUrl: options.startUrl,
    options,
    phases: buildPhases(options),
    issues: new Map(),
    clicksTried: 0,
    startedAt: now,
    updatedAt: now,
    browser: null,
    context: null,
    page: null,
    abort: false,
  };
  sessions.set(id, session);
  session.runPromise = runScan(session).finally(() => {
    // keep session for polling after done
  });
  return toView(session);
}

export function getScan(sessionId: string): ScanSessionView | null {
  const session = sessions.get(sessionId);
  return session ? toView(session) : null;
}

export async function stopScan(sessionId: string): Promise<ScanSessionView> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status === "done" || session.status === "cancelled" || session.status === "error") {
    return toView(session);
  }
  session.abort = true;
  session.status = "stopping";
  session.progress = "正在停止…";
  touch(session);
  await session.runPromise?.catch(() => undefined);
  if (session.status === "stopping") session.status = "cancelled";
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
