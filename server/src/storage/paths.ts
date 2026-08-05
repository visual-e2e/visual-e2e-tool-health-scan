import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getHostDataDir } from "../host-paths.js";

/**
 * Storage 根目录：仅来自 Host RPC `getDataDir().storage`（经 /api/host/bootstrap 注入）。
 * 工具数据落在 `{storage}/{toolId}/`（profiles、reports）；不读不写 Host 的 Storage/config。
 */
export function resolveClientStorageRoot(): string {
  const fromRpc = getHostDataDir()?.storage?.trim();
  if (fromRpc) return fromRpc;
  throw new Error("Storage 路径未注入：请在 Host 内打开工具以 bootstrap getDataDir()");
}

export function tryResolveClientStorageRoot(): string | null {
  try {
    return resolveClientStorageRoot();
  } catch {
    return null;
  }
}

export function resolveToolId(): string {
  return process.env.TOOL_ID?.trim() || "health-scan";
}

export function resolveToolStorageRoot(toolId = resolveToolId()): string {
  return join(resolveClientStorageRoot(), toolId);
}

export function resolveToolReportsDir(toolId = resolveToolId()): string {
  return join(resolveToolStorageRoot(toolId), "reports");
}

export function normalizeReportGroupId(groupId?: string): string {
  const raw = groupId?.trim();
  return raw ? raw : "_unknown";
}

export function resolveReportDir(
  groupId: string | undefined,
  reportId: string,
  toolId = resolveToolId(),
): string {
  return join(resolveToolReportsDir(toolId), normalizeReportGroupId(groupId), reportId);
}

export function resolveReportLogsDir(
  groupId: string | undefined,
  reportId: string,
  toolId = resolveToolId(),
): string {
  return join(resolveReportDir(groupId, reportId, toolId), "logs");
}

export function resolveReportScreenshotsDir(
  groupId: string | undefined,
  reportId: string,
  toolId = resolveToolId(),
): string {
  return join(resolveReportDir(groupId, reportId, toolId), "screenshots");
}

export function resolveReportVideosDir(
  groupId: string | undefined,
  reportId: string,
  toolId = resolveToolId(),
): string {
  return join(resolveReportDir(groupId, reportId, toolId), "videos");
}

export function resolveReportJsonPath(
  groupId: string | undefined,
  reportId: string,
  toolId = resolveToolId(),
): string {
  return join(resolveReportDir(groupId, reportId, toolId), "report.json");
}

export function resolveReportLogPath(
  groupId: string | undefined,
  reportId: string,
  toolId = resolveToolId(),
): string {
  return join(resolveReportLogsDir(groupId, reportId, toolId), "run.log");
}

export function resolveSessionArtifactsDir(sessionId: string, toolId = resolveToolId()): string {
  const legacy = join(resolveToolStorageRoot(toolId), "artifacts", sessionId);
  if (existsSync(legacy)) return legacy;

  const reportsRoot = resolveToolReportsDir(toolId);
  if (!existsSync(reportsRoot)) return legacy;
  let entries: string[] = [];
  try {
    entries = readdirSync(reportsRoot);
  } catch {
    return legacy;
  }
  for (const name of entries) {
    if (name === "index.json") continue;
    const dir = join(reportsRoot, name, sessionId);
    if (existsSync(dir)) return dir;
  }
  return legacy;
}

export function resolveProfileDir(profileId: string, toolId = resolveToolId()): string {
  return join(resolveToolStorageRoot(toolId), "profiles", profileId);
}

export function resolveProfilesIndexPath(toolId = resolveToolId()): string {
  return join(resolveToolStorageRoot(toolId), "profiles", "index.json");
}

export function resolveProfileScanConfigPath(profileId: string, toolId = resolveToolId()): string {
  return join(resolveProfileDir(profileId, toolId), "scan-config.json");
}

/** Per-profile rules: blacklist / whitelist / probe-selectors / url-exclude. */
export function resolveProfileConfigDir(profileId: string, toolId = resolveToolId()): string {
  return join(resolveProfileDir(profileId, toolId), "config");
}
