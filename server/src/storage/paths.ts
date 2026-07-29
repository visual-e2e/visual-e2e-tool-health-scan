import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function resolveClientStorageRoot(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "visual-e2e-test", "Storage");
  }
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) return join(appdata, "visual-e2e-test", "Storage");
  }
  return join(homedir(), ".local", "share", "visual-e2e-test", "Storage");
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

export function resolveSessionArtifactsDir(sessionId: string, toolId = resolveToolId()): string {
  return join(resolveToolStorageRoot(toolId), "artifacts", sessionId);
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
  const legacyDir = join(resolveClientStorageRoot(), "config");
  const targetDir = resolveToolConfigDir(toolId);
  if (!existsSync(legacyDir) || existsSync(join(targetDir, "blacklist.json"))) {
    return;
  }
  await mkdir(targetDir, { recursive: true });
  const files = await readdir(legacyDir);
  // Only migrate rule files — never copy Host browser settings into tool config
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
