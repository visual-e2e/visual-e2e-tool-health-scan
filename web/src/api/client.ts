import type {
  BlacklistRuleFile,
  ClickRuleConfig,
  CreateProfilePayload,
  CreateScanPayload,
  HostDataDirPaths,
  HostProjectContext,
  HostRuntimePaths,
  IgnoreRequestRule,
  LoginDefaults,
  LoginProfile,
  LoginSelectors,
  PersistedScanConfig,
  ProjectMeta,
  ProbeSelectorsConfig,
  ReportMeta,
  ReportRecord,
  RuleListType,
  ScanOptions,
  ScanProfileMeta,
  ScanSession,
  UpdateProfilePayload,
  UpdateReportPayload,
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

type RulesBundle = {
  blacklist: BlacklistRuleFile;
  whitelist: WhitelistRuleFile;
  files: { baseDir: string; blacklistPath: string; whitelistPath: string };
};

export const api = {
  health: () => request<{ ok: boolean; toolId: string }>("/api/health"),
  bootstrapHost: (body: {
    hostRuntime?: HostRuntimePaths;
    hostDataDir?: HostDataDirPaths;
  }) =>
    request<{ ok: boolean }>("/api/host/bootstrap", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  browserStatus: () =>
    request<{ ok: boolean; path: string; version: string; hints: string[] }>("/api/browser/status"),
  projects: () => request<{ projects: ProjectMeta[] }>("/api/projects"),
  projectContext: (projectId: string) =>
    request<HostProjectContext>(`/api/projects/${encodeURIComponent(projectId)}/context`),
  loginDefaults: (projectId: string) =>
    request<LoginDefaults>(`/api/projects/${encodeURIComponent(projectId)}/login-defaults`),

  listProfiles: () => request<{ profiles: ScanProfileMeta[] }>("/api/profiles"),
  createProfile: (body: CreateProfilePayload) =>
    request<ScanProfileMeta>("/api/profiles", { method: "POST", body: JSON.stringify(body) }),
  getProfile: (profileId: string) => request<ScanProfileMeta>(`/api/profiles/${profileId}`),
  updateProfile: (profileId: string, body: UpdateProfilePayload) =>
    request<ScanProfileMeta>(`/api/profiles/${profileId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProfile: (profileId: string) =>
    request<{ ok: boolean }>(`/api/profiles/${profileId}`, { method: "DELETE" }),
  getScanConfig: (profileId: string) =>
    request<PersistedScanConfig>(`/api/profiles/${profileId}/scan-config`),
  saveScanConfig: (profileId: string, body: PersistedScanConfig) =>
    request<PersistedScanConfig>(`/api/profiles/${profileId}/scan-config`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  createScan: (body: CreateScanPayload | (Partial<ScanOptions> & { startUrl: string })) =>
    request<ScanSession>("/api/scans", { method: "POST", body: JSON.stringify(body) }),
  getScan: (sessionId: string) => request<ScanSession>(`/api/scans/${sessionId}`),
  startScan: (sessionId: string) => postScanAction(sessionId, "start"),
  pauseScan: (sessionId: string) => postScanAction(sessionId, "pause"),
  resumeScan: (sessionId: string) => postScanAction(sessionId, "resume"),
  stopScan: (sessionId: string) => postScanAction(sessionId, "stop"),
  deleteScan: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/scans/${sessionId}`, { method: "DELETE" }),

  getRules: (profileId: string) => request<RulesBundle>(`/api/profiles/${profileId}/rules`),
  saveRules: (
    profileId: string,
    body: {
      blacklistRules: ClickRuleConfig[];
      whitelistRules: ClickRuleConfig[];
      whitelistDefaultWeight: number;
    },
  ) =>
    request<RulesBundle>(`/api/profiles/${profileId}/rules`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resetRules: (profileId: string) =>
    request<RulesBundle>(`/api/profiles/${profileId}/rules/reset`, {
      method: "POST",
      body: "{}",
    }),
  openRulesFile: (profileId: string, list: RuleListType) =>
    request<{ path: string }>(`/api/profiles/${profileId}/rules/open-file`, {
      method: "POST",
      body: JSON.stringify({ list }),
    }),

  getProbeSelectors: (profileId: string) =>
    request<{ config: ProbeSelectorsConfig; files: { path: string; baseDir: string } }>(
      `/api/profiles/${profileId}/probe-selectors`,
    ),
  saveProbeSelectors: (profileId: string, body: ProbeSelectorsConfig) =>
    request<{ config: ProbeSelectorsConfig; files: { path: string; baseDir: string } }>(
      `/api/profiles/${profileId}/probe-selectors`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  resetProbeSelectors: (profileId: string, mode: "default" | "generic" = "default") =>
    request<{ config: ProbeSelectorsConfig; files: { path: string; baseDir: string } }>(
      `/api/profiles/${profileId}/probe-selectors/reset`,
      { method: "POST", body: JSON.stringify({ mode }) },
    ),

  getUrlExclude: (profileId: string) =>
    request<{ rules: IgnoreRequestRule[]; files: { path: string; baseDir: string } }>(
      `/api/profiles/${profileId}/url-exclude`,
    ),
  saveUrlExclude: (profileId: string, rules: IgnoreRequestRule[]) =>
    request<{ rules: IgnoreRequestRule[]; files: { path: string; baseDir: string } }>(
      `/api/profiles/${profileId}/url-exclude`,
      { method: "PUT", body: JSON.stringify({ rules }) },
    ),
  resetUrlExclude: (profileId: string) =>
    request<{ rules: IgnoreRequestRule[]; files: { path: string; baseDir: string } }>(
      `/api/profiles/${profileId}/url-exclude/reset`,
      { method: "POST", body: "{}" },
    ),

  listReports: (profileId?: string) =>
    request<{ reports: ReportMeta[] }>(
      profileId ? `/api/reports?profileId=${encodeURIComponent(profileId)}` : "/api/reports",
    ),
  getReport: (reportId: string) => request<ReportRecord>(`/api/reports/${reportId}`),
  updateReport: (reportId: string, body: UpdateReportPayload) =>
    request<ReportMeta>(`/api/reports/${reportId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteReport: (reportId: string) =>
    request<{ ok: boolean }>(`/api/reports/${reportId}`, { method: "DELETE" }),
  openReportsDir: () => request<{ path: string }>("/api/reports/open-dir", { method: "POST", body: "{}" }),
  artifactUrl: (sessionId: string, filename: string) => {
    const safePath = filename
      .split("/")
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `/api/artifacts/${encodeURIComponent(sessionId)}/${safePath}`;
  },
};

export type { LoginProfile, LoginSelectors, PersistedScanConfig };
