export * from "../../core";

export type { ScanSessionView as ScanSession } from "../../core";

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

export interface HostRuntimePaths {
  browser_path: string;
  ffmpeg_path: string;
}

export interface HostDataDirPaths {
  storage: string;
  path: string;
  projects: string;
  config: string;
  e2e_root: string;
  tools: string;
}

export interface CreateScanPayload {
  profileId?: string;
  startUrl?: string;
  hostRuntime?: HostRuntimePaths;
  hostDataDir?: HostDataDirPaths;
}

export interface ProjectMeta {
  id: string;
  name: string;
}

export interface ScanConfigState {
  projectId?: string;
  startUrl: string;
  enableNetwork: boolean;
  enableLayout: boolean;
  enableClick: boolean;
  maxClicks: number;
}
