import type {
  BlacklistRuleFile,
  ClickRuleConfig,
  HostProjectContext,
  ProjectMeta,
  RuleListType,
  ScanOptions,
  ScanSession,
  WhitelistRuleFile,
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data;
}

function postScanAction(sessionId: string, action: string) {
  return request<ScanSession>(`/api/scans/${sessionId}/${action}`, {
    method: "POST",
    body: "{}",
  });
}

export const api = {
  health: () => request<{ ok: boolean; toolId: string }>("/api/health"),
  browserStatus: () =>
    request<{ ok: boolean; path: string; version: string; hints: string[] }>("/api/browser/status"),
  projects: () => request<{ projects: ProjectMeta[] }>("/api/projects"),
  projectContext: (projectId: string) =>
    request<HostProjectContext>(`/api/projects/${encodeURIComponent(projectId)}/context`),
  createScan: (body: Partial<ScanOptions> & { startUrl: string }) =>
    request<ScanSession>("/api/scans", { method: "POST", body: JSON.stringify(body) }),
  getScan: (sessionId: string) => request<ScanSession>(`/api/scans/${sessionId}`),
  startScan: (sessionId: string) => postScanAction(sessionId, "start"),
  pauseScan: (sessionId: string) => postScanAction(sessionId, "pause"),
  resumeScan: (sessionId: string) => postScanAction(sessionId, "resume"),
  stopScan: (sessionId: string) => postScanAction(sessionId, "stop"),
  deleteScan: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/scans/${sessionId}`, { method: "DELETE" }),
  getRules: () =>
    request<{
      blacklist: BlacklistRuleFile;
      whitelist: WhitelistRuleFile;
      files: { baseDir: string; blacklistPath: string; whitelistPath: string };
    }>("/api/rules"),
  saveRules: (body: {
    blacklistRules: ClickRuleConfig[];
    whitelistRules: ClickRuleConfig[];
    whitelistDefaultWeight: number;
  }) =>
    request<{
      blacklist: BlacklistRuleFile;
      whitelist: WhitelistRuleFile;
      files: { baseDir: string; blacklistPath: string; whitelistPath: string };
    }>("/api/rules", { method: "POST", body: JSON.stringify(body) }),
  resetRules: () =>
    request<{
      blacklist: BlacklistRuleFile;
      whitelist: WhitelistRuleFile;
      files: { baseDir: string; blacklistPath: string; whitelistPath: string };
    }>("/api/rules/reset", { method: "POST", body: "{}" }),
  openRulesFile: (list: RuleListType) =>
    request<{ path: string }>("/api/rules/open-file", {
      method: "POST",
      body: JSON.stringify({ list }),
    }),
};
