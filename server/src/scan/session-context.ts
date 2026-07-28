import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  IssueCategory,
  IssueSeverity,
  ScanStatus,
  type ClickActionLog,
  type ClickTargetIdentity,
  type FailureCode,
  type ScanIssue,
  type ScanOptions,
  type ScanPhase,
  type ScanSessionView,
} from "../types.js";

export interface ActiveScan {
  id: string;
  status: ScanStatus;
  startUrl: string;
  currentUrl: string;
  options: ScanOptions;
  phases: ScanPhase[];
  issues: Map<string, ScanIssue>;
  clickActions: ClickActionLog[];
  clicksTried: number;
  clicksSkipped: number;
  progress?: string;
  error?: string;
  reportId?: string;
  videoPath?: string;
  artifactsDir?: string;
  startedAt: string;
  updatedAt: string;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  abort: boolean;
  pauseRequested: boolean;
  collecting: boolean;
  profileId?: string;
  runPromise?: Promise<void>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function touch(session: ActiveScan): void {
  session.updatedAt = nowIso();
}

function issueKey(parts: Array<string | number | undefined>): string {
  return parts.map((p) => String(p ?? "")).join("|");
}

export function addIssue(
  session: ActiveScan,
  issue: Omit<ScanIssue, "id" | "count" | "timestamp">,
): void {
  const key = issueKey([
    issue.category,
    issue.title,
    issue.pageUrl,
    issue.url,
    issue.status,
    issue.clickTarget?.targetId,
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

export function addClickAction(
  session: ActiveScan,
  action: Omit<ClickActionLog, "id" | "timestamp">,
): void {
  session.clickActions.push({
    ...action,
    id: randomUUID(),
    timestamp: nowIso(),
  });
}

export function toView(session: ActiveScan): ScanSessionView {
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
    clickActions: session.clickActions,
    summary: {
      network: issues.filter((i) => i.category === IssueCategory.Network).length,
      layout: issues.filter((i) => i.category === IssueCategory.Layout).length,
      click: issues.filter((i) => i.category === IssueCategory.Click).length,
      runtime: issues.filter((i) => i.category === IssueCategory.Runtime).length,
      clicksTried: session.clicksTried,
      clicksSkipped: session.clicksSkipped,
    },
    progress: session.progress,
    error: session.error,
    reportId: session.reportId,
    videoPath: session.videoPath,
    artifactsDir: session.artifactsDir,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
  };
}

export function markPhase(session: ActiveScan, name: ScanPhase["name"], done: boolean): void {
  const phase = session.phases.find((p) => p.name === name);
  if (phase) phase.done = done;
  touch(session);
}

export function recordClickFailure(
  session: ActiveScan,
  pageUrl: string,
  target: ClickTargetIdentity,
  error?: string,
  failureCode?: FailureCode,
  screenshotPath?: string,
): void {
  addIssue(session, {
    category: IssueCategory.Click,
    severity: IssueSeverity.Warning,
    title: "点击失败",
    detail: error,
    pageUrl,
    clickTarget: target,
    failureCode,
    screenshotPath,
  });
  touch(session);
}
