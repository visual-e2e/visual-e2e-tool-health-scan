export const TOOL_MSG = {
  PROJECT_CONTEXT: "vet-tool:project:context",
  PROJECT_CONTEXT_REQUEST: "vet-tool:project:context:request",
} as const;

export interface HostProjectContext {
  projectId: string;
  projectName?: string;
  baseUrl: string;
  scenariosRelPath?: string;
}

export type IssueCategory = "network" | "layout" | "click" | "runtime";
export type IssueSeverity = "error" | "warning";
export type ScanStatus =
  | "starting"
  | "running"
  | "stopping"
  | "done"
  | "cancelled"
  | "error";

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
  urlExclude: string[];
  clickExclude: string[];
}

export interface ScanPhase {
  name: "navigate" | "network" | "layout" | "click";
  label: string;
  done: boolean;
}

export interface ScanSession {
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

export interface ProjectMeta {
  id: string;
  name: string;
}
