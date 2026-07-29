import type { RegistryStatus } from "../enums/registry.js";
import type { PhaseName, ScanStatus } from "../enums/status.js";
import type { ScanOptions } from "./options.js";
import type { ClickActionLog, ScanIssue } from "./issue.js";

export interface ScanPhase {
  name: PhaseName;
  label: string;
  done: boolean;
}

export interface InteractionRegistryItem {
  id: string;
  label: string;
  selector: string;
  eventType: string;
  layer: number;
  source: string;
  scopeType?: "overlay" | "page";
  scopeId?: string;
  status: RegistryStatus;
  lastUpdatedAt: string;
  lastResult?: string;
}

export interface ScanSessionView {
  sessionId: string;
  status: ScanStatus;
  startUrl: string;
  currentUrl: string;
  options: ScanOptions;
  phases: ScanPhase[];
  interactionRegistry: InteractionRegistryItem[];
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
  reportId?: string;
  videoPath?: string;
  artifactsDir?: string;
  startedAt: string;
  updatedAt: string;
}
