import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getHostDataDir } from "./host-paths.js";

export const Runtime = {
  Client: "client",
  Workspace: "workspace",
} as const;

export type Runtime = (typeof Runtime)[keyof typeof Runtime];

export function resolveE2eRoot(): string {
  const fromRpc = getHostDataDir()?.e2e_root?.trim();
  if (fromRpc) return resolve(fromRpc);
  const fromEnv = process.env.E2E_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

export { resolveClientStorageRoot } from "./storage/paths.js";

/**
 * Host global config dir (Storage/config) — browser-runtime / settings only.
 * Prefer RPC getDataDir().config after bootstrap; never used for tool rules.
 */
export function resolveHostConfigDir(e2eRoot: string): string {
  const fromRpc = getHostDataDir()?.config?.trim();
  if (fromRpc) return resolve(fromRpc);
  const fromEnv = process.env.CONFIG_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const storage = getHostDataDir()?.storage?.trim();
  if (storage) {
    const hostConfig = join(storage, "config");
    if (existsSync(hostConfig)) return hostConfig;
  }
  return join(e2eRoot, "config");
}

/** @deprecated Prefer resolveHostConfigDir for browser; tool rules use profile paths. */
export function resolveConfigDir(e2eRoot: string): string {
  return resolveHostConfigDir(e2eRoot);
}

export function resolveRuntime(): Runtime {
  return process.env.E2E_RUNTIME === Runtime.Workspace ? Runtime.Workspace : Runtime.Client;
}

export function resolveSettingsPath(configDir: string): string {
  return join(configDir, "settings.json");
}
