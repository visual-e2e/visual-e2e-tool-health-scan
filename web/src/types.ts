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
