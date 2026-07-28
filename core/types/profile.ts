import type { ScanSessionView } from "./session.js";

export interface ScanProfileMeta {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
  startUrl: string;
  createdAt: string;
  updatedAt: string;
  lastScanAt?: string;
  lastReportSummary?: ScanSessionView["summary"];
}

export interface CreateProfilePayload {
  name: string;
  description?: string;
  projectId?: string;
  startUrl?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  description?: string;
  projectId?: string;
  startUrl?: string;
}
