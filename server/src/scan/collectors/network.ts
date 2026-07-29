import type { Page, Request, Response } from "playwright";
import {
  IssueCategory,
  IssueSeverity,
  PhaseName,
  isIgnoredRequest,
  type IgnoreRequestRule,
  type ScanOptions,
} from "../../types.js";
import { addIssue, markPhase, touch, type ActiveScan } from "../session-context.js";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";

const STATIC_TYPES = new Set(["stylesheet", "image", "font", "media", "script"]);
const API_TYPES = new Set(["xhr", "fetch"]);

export function attachCollectors(
  session: ActiveScan,
  page: Page,
  ignoreRules: IgnoreRequestRule[] = session.options.ignoreRequestRules ?? [],
): void {
  const onResponse = (res: Response) => {
    if (!session.collecting || !session.options.enableNetwork) return;
    const req = res.request();
    const url = res.url();
    const resourceType = req.resourceType();
    if (isIgnoredRequest(url, resourceType, ignoreRules)) return;
    const status = res.status();
    const pageUrl = page.url();
    const minApi = session.options.apiErrorMinStatus;

    if (STATIC_TYPES.has(resourceType) && (status === 404 || status >= 500)) {
      addIssue(session, {
        category: IssueCategory.Network,
        severity: IssueSeverity.Error,
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

    if (API_TYPES.has(resourceType) && status >= minApi) {
      addIssue(session, {
        category: IssueCategory.Network,
        severity: status >= 500 ? IssueSeverity.Error : IssueSeverity.Warning,
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
    if (!session.collecting || !session.options.enableNetwork) return;
    const url = req.url();
    const resourceType = req.resourceType();
    if (isIgnoredRequest(url, resourceType, ignoreRules)) return;
    if (!STATIC_TYPES.has(resourceType) && !API_TYPES.has(resourceType)) return;
    const failure = req.failure()?.errorText ?? "request failed";
    addIssue(session, {
      category: IssueCategory.Network,
      severity: IssueSeverity.Error,
      title: "请求失败",
      detail: failure,
      pageUrl: page.url(),
      url,
      resourceType,
    });
    touch(session);
  };

  const onPageError = (err: Error) => {
    if (!session.collecting) return;
    addIssue(session, {
      category: IssueCategory.Runtime,
      severity: IssueSeverity.Error,
      title: "页面 JS 异常",
      detail: err.message,
      pageUrl: page.url(),
    });
    touch(session);
  };

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (!session.collecting) return;
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon\.ico/i.test(text)) return;
    addIssue(session, {
      category: IssueCategory.Runtime,
      severity: IssueSeverity.Warning,
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

export function resolveIgnoreRequestRules(options: ScanOptions): IgnoreRequestRule[] {
  return options.ignoreRequestRules ?? [];
}

export async function runNetworkSnapshot(session: ActiveScan, page: Page): Promise<void> {
  if (!session.options.enableNetwork) return;

  session.progress = "审计资源加载…";
  touch(session);
  markPhase(session, PhaseName.NetworkSnapshot, false);

  const pageUrl = page.url();
  const findings = await page.evaluate((shim: string) => {
    eval(shim);
    const out: Array<{
      title: string;
      detail: string;
      url?: string;
      resourceType?: string;
      severity: IssueSeverity;
    }> = [];

    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const loadedUrls = new Set(entries.map((e) => e.name));

    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
      const href = (link as HTMLLinkElement).href;
      if (!href) continue;
      const matched = [...loadedUrls].some((u) => u === href || u.startsWith(href.split("?")[0]!));
      if (!matched) {
        out.push({
          title: "CSS 可能未加载",
          detail: `stylesheet 未出现在 Performance entries: ${href}`,
          url: href,
          resourceType: "stylesheet",
          severity: IssueSeverity.Error,
        });
      }
    }

    for (const entry of entries) {
      const rt = (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
      if (rt === 404) {
        out.push({
          title: "资源 404",
          detail: entry.name,
          url: entry.name,
          severity: IssueSeverity.Error,
        });
      }
    }

    return out;
  }, BROWSER_EVAL_SHIM);

  const ignoreRules = session.options.ignoreRequestRules ?? [];
  for (const f of findings) {
    if (f.url && isIgnoredRequest(f.url, f.resourceType ?? "other", ignoreRules)) continue;
    addIssue(session, {
      category: IssueCategory.Network,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      pageUrl,
      url: f.url,
      resourceType: f.resourceType,
    });
  }

  markPhase(session, PhaseName.NetworkSnapshot, true);
  touch(session);
}
