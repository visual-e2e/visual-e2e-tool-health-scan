import type { HostProjectContext, ProjectMeta, ScanOptions, ScanSession } from "../types";

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
  stopScan: (sessionId: string) =>
    request<ScanSession>(`/api/scans/${sessionId}/stop`, { method: "POST", body: "{}" }),
  deleteScan: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/scans/${sessionId}`, { method: "DELETE" }),
};
