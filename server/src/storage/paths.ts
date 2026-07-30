import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { getHostDataDir } from "../host-paths.js";

/**
 * Storage 根目录：优先 Host RPC `getDataDir().storage`（经 /api/host/bootstrap 注入）。
 * 独立开发时可由 Host/CLI 注入 CONFIG_DIR（其父级为 Storage）。
 */
export function resolveClientStorageRoot(): string {
  const fromRpc = getHostDataDir()?.storage?.trim();
  if (fromRpc) return fromRpc;

  const configDir = process.env.CONFIG_DIR?.trim();
  if (configDir) {
    const parent = dirname(configDir);
    if (basename(parent) === "Storage") return parent;
  }

  throw new Error("Storage 路径未注入：请在 Host 内打开工具以 bootstrap getDataDir()");
}

export function resolveToolId(): string {
  return process.env.TOOL_ID?.trim() || "health-scan";
}

export function resolveToolStorageRoot(toolId = resolveToolId()): string {
  return join(resolveClientStorageRoot(), toolId);
}

export function resolveToolConfigDir(toolId = resolveToolId()): string {
  return join(resolveToolStorageRoot(toolId), "config");
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

export function resolveProfileConfigDir(profileId: string, toolId = resolveToolId()): string {
  return join(resolveProfileDir(profileId, toolId), "config");
}

export async function migrateLegacyConfigIfNeeded(toolId = resolveToolId()): Promise<void> {
  let storageRoot: string;
  try {
    storageRoot = resolveClientStorageRoot();
  } catch {
    return;
  }
  const legacyDir = join(storageRoot, "config");
  const targetDir = resolveToolConfigDir(toolId);
  if (!existsSync(legacyDir) || existsSync(join(targetDir, "blacklist.json"))) {
    return;
  }
  await mkdir(targetDir, { recursive: true });
  const files = await readdir(legacyDir);
  const ruleFiles = new Set([
    "blacklist.json",
    "whitelist.json",
    "probe-selectors.json",
    "url-exclude.json",
  ]);
  for (const file of files) {
    if (ruleFiles.has(file)) {
      await cp(join(legacyDir, file), join(targetDir, file));
    }
  }
}
