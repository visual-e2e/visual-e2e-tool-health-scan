import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveE2eRoot(): string {
  const fromEnv = process.env.E2E_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

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

export function resolveConfigDir(e2eRoot: string): string {
  const fromEnv = process.env.CONFIG_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const clientConfig = join(resolveClientStorageRoot(), "config");
  if (existsSync(clientConfig)) return clientConfig;
  return join(e2eRoot, "config");
}

export function resolveRuntime(): "client" | "workspace" {
  return process.env.E2E_RUNTIME === "workspace" ? "workspace" : "client";
}

export function resolveSettingsPath(configDir: string): string {
  return join(configDir, "settings.json");
}
