import {
  getRpcClient,
  isEmbedded,
  type BrowserRuntimeResult,
  type DataDirResult,
} from "@visual-e2e/rpc-sdk";
import { api } from "../api/client";
import type { HostDataDirPaths, HostRuntimePaths, LoginDefaults } from "../types";
import { resolveLoginDefaults } from "../utils/loginDefaults";

export async function fetchHostRuntimePaths(): Promise<{
  runtime: HostRuntimePaths | null;
  dataDir: HostDataDirPaths | null;
}> {
  if (!isEmbedded()) {
    return { runtime: null, dataDir: null };
  }

  const rpc = getRpcClient();
  const [runtimeRes, dataDirRes] = await Promise.all([
    rpc.getBrowserRuntime().catch(() => null as BrowserRuntimeResult | null),
    rpc.getDataDir().catch(() => null as DataDirResult | null),
  ]);

  const runtime =
    runtimeRes && (runtimeRes.browser_path || runtimeRes.ffmpeg_path)
      ? {
          browser_path: runtimeRes.browser_path ?? "",
          ffmpeg_path: runtimeRes.ffmpeg_path ?? "",
        }
      : null;

  const dataDir = dataDirRes
    ? {
        storage: dataDirRes.storage,
        path: dataDirRes.path,
        projects: dataDirRes.projects,
        config: dataDirRes.config,
        e2e_root: dataDirRes.e2e_root,
        tools: dataDirRes.tools,
      }
    : null;

  return { runtime, dataDir };
}

export async function bootstrapHostOnServer(): Promise<void> {
  const { runtime, dataDir } = await fetchHostRuntimePaths();
  if (!runtime && !dataDir) return;
  await api.bootstrapHost({
    hostRuntime: runtime ?? undefined,
    hostDataDir: dataDir ?? undefined,
  });
}

/** Shared gate: storage/runtime bootstrap once before any Storage-backed API. */
let hostBootstrapPromise: Promise<void> | null = null;

export function ensureHostBootstrapped(): Promise<void> {
  if (!hostBootstrapPromise) {
    hostBootstrapPromise = bootstrapHostOnServer().catch(() => undefined);
  }
  return hostBootstrapPromise;
}

export async function fetchLoginDefaults(projectId: string): Promise<LoginDefaults> {
  if (!isEmbedded()) {
    return api.loginDefaults(projectId);
  }

  const rpc = getRpcClient();
  const [ctx, vars] = await Promise.all([
    rpc.getProjectContext().catch(() => null),
    rpc.getProjectVariables(projectId).catch(() => ({} as Record<string, Record<string, string>>)),
  ]);

  const fromVars = resolveLoginDefaults(vars);
  const username = ctx?.username?.trim() || fromVars.loginProfile?.username || "";
  const password = ctx?.password?.trim() || fromVars.loginProfile?.password || "";
  const baseUrl = (ctx?.base_url || fromVars.startUrl || "").replace(/\/$/, "");

  return {
    startUrl: fromVars.startUrl || baseUrl || undefined,
    projectId,
    loginProfile:
      username || password ? { username, password, source: "rpc" as const } : fromVars.loginProfile,
    loginSelectors: fromVars.loginSelectors,
  };
}

export async function buildCreateScanPayload(
  body: { profileId: string } | { startUrl: string; profileId?: string },
): Promise<{
  profileId?: string;
  startUrl?: string;
  hostRuntime?: HostRuntimePaths;
  hostDataDir?: HostDataDirPaths;
}> {
  const { runtime, dataDir } = await fetchHostRuntimePaths();

  if ("profileId" in body && body.profileId && !("startUrl" in body)) {
    return {
      profileId: body.profileId,
      hostRuntime: runtime ?? undefined,
      hostDataDir: dataDir ?? undefined,
    };
  }

  return {
    ...body,
    hostRuntime: runtime ?? undefined,
    hostDataDir: dataDir ?? undefined,
  };
}
