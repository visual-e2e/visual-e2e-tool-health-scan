import type { ScanStatus } from "../enums/status.js";
import type { ScanSessionView } from "./session.js";

export interface ReportMeta {
  id: string;
  name: string;
  description?: string;
  sessionId: string;
  status: ScanStatus;
  startUrl: string;
  projectId?: string;
  profileId?: string;
  createdAt: string;
  updatedAt: string;
  summary: ScanSessionView["summary"];
  reportPath: string;
  artifactsDir: string;
  videoPath?: string;
}

export interface ReportRecord extends ReportMeta {
  session: ScanSessionView;
}

export interface UpdateReportPayload {
  name?: string;
  description?: string;
}
