import type { PhaseName, ScanStatus } from "../enums/status.js";
import type { ScanOptions } from "./options.js";
import type { ClickActionLog, ScanIssue } from "./issue.js";

export interface ScanPhase {
  name: PhaseName;
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
  clickActions: ClickActionLog[];
  summary: {
    network: number;
    layout: number;
    click: number;
    runtime: number;
    clicksTried: number;
    clicksSkipped: number;
  };
  progress?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
}
