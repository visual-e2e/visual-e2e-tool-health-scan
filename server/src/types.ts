export type ScanStatus =
  | "starting"
  | "running"
  | "stopping"
  | "done"
  | "cancelled"
  | "error";

export type IssueCategory = "network" | "layout" | "click" | "runtime";

export type IssueSeverity = "error" | "warning";

export interface ScanIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  detail?: string;
  pageUrl: string;
  url?: string;
  status?: number;
  resourceType?: string;
  selector?: string;
  count: number;
  timestamp: string;
}

export interface ScanOptions {
  startUrl: string;
  enableNetwork: boolean;
  enableLayout: boolean;
  enableClick: boolean;
  maxClicks: number;
  clickDelayMs: number;
  settleMs: number;
  /** RegExp source strings; matched against request URL */
  urlExclude: string[];
  /** Text substrings that skip click candidates */
  clickExclude: string[];
}

export interface ScanPhase {
  name: "navigate" | "network" | "layout" | "click";
  label: string;
  done: boolean;
}

export interface ScanSessionView {
  sessionId: string;
  status: ScanStatus;
  startUrl: string;
  currentUrl: string;
  options: ScanOptions;
  phases: ScanPhase[];
  issues: ScanIssue[];
  summary: {
    network: number;
    layout: number;
    click: number;
    runtime: number;
    clicksTried: number;
  };
  progress?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

export const DEFAULT_SCAN_OPTIONS: Omit<ScanOptions, "startUrl"> = {
  enableNetwork: true,
  enableLayout: true,
  enableClick: true,
  maxClicks: 30,
  clickDelayMs: 450,
  settleMs: 1200,
  urlExclude: [
    "google-analytics",
    "googletagmanager",
    "hm\\.baidu\\.com",
    "sentry\\.io",
    "hotjar",
  ],
  clickExclude: ["删除", "注销", "退出", "登出", "支付", "付款", "提交订单", "清空"],
};
