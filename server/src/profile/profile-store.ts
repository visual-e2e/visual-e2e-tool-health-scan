import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SCAN_OPTIONS,
  getDefaultBlacklistConfig,
  getDefaultWhitelistConfig,
  type CreateProfilePayload,
  type PersistedScanConfig,
  type ScanProfileMeta,
  type UpdateProfilePayload,
} from "../types.js";
import {
  resolveProfileConfigDir,
  resolveProfileDir,
  resolveProfileScanConfigPath,
  resolveProfilesIndexPath,
  resolveToolConfigDir,
} from "../storage/paths.js";
import { getRulesConfigBundle, initProfileRulesFromDefaults } from "../rules-config.js";
import { getProbeSelectors, initProfileProbeSelectorsFromDefaults } from "../probe-selectors-store.js";
import { getUrlExclude, initProfileUrlExcludeFromDefaults } from "../url-exclude-store.js";

interface ProfileIndex {
  profiles: ScanProfileMeta[];
}

async function readIndex(): Promise<ProfileIndex> {
  const indexPath = resolveProfilesIndexPath();
  await mkdir(join(indexPath, ".."), { recursive: true });
  if (!existsSync(indexPath)) return { profiles: [] };
  const raw = await readFile(indexPath, "utf-8");
  return JSON.parse(raw) as ProfileIndex;
}

async function writeIndex(index: ProfileIndex): Promise<void> {
  const indexPath = resolveProfilesIndexPath();
  await mkdir(join(indexPath, ".."), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

function defaultScanConfig(partial?: Partial<PersistedScanConfig>): PersistedScanConfig {
  return {
    startUrl: partial?.startUrl ?? "",
    projectId: partial?.projectId,
    enableNetwork: partial?.enableNetwork ?? DEFAULT_SCAN_OPTIONS.enableNetwork,
    enableLayout: partial?.enableLayout ?? DEFAULT_SCAN_OPTIONS.enableLayout,
    enableClick: partial?.enableClick ?? DEFAULT_SCAN_OPTIONS.enableClick,
    enableNavigationProbe:
      partial?.enableNavigationProbe ?? DEFAULT_SCAN_OPTIONS.enableNavigationProbe,
    enableHoverProbe: partial?.enableHoverProbe ?? DEFAULT_SCAN_OPTIONS.enableHoverProbe,
    maxClicks: partial?.maxClicks ?? DEFAULT_SCAN_OPTIONS.maxClicks,
    maxOverlayDepth: partial?.maxOverlayDepth ?? DEFAULT_SCAN_OPTIONS.maxOverlayDepth,
    clickDelayMs: partial?.clickDelayMs ?? DEFAULT_SCAN_OPTIONS.clickDelayMs,
    postClickSettleMs: partial?.postClickSettleMs ?? DEFAULT_SCAN_OPTIONS.postClickSettleMs,
    settleMs: partial?.settleMs ?? DEFAULT_SCAN_OPTIONS.settleMs,
    networkIdleMs: partial?.networkIdleMs ?? DEFAULT_SCAN_OPTIONS.networkIdleMs,
    consecutiveErrorLimit:
      partial?.consecutiveErrorLimit ?? DEFAULT_SCAN_OPTIONS.consecutiveErrorLimit,
    refreshOnConsecutiveErrors:
      partial?.refreshOnConsecutiveErrors ?? DEFAULT_SCAN_OPTIONS.refreshOnConsecutiveErrors,
    clickPolicy: partial?.clickPolicy ?? DEFAULT_SCAN_OPTIONS.clickPolicy,
    defaultWeight: partial?.defaultWeight ?? DEFAULT_SCAN_OPTIONS.defaultWeight,
    clickSortTolerancePx:
      partial?.clickSortTolerancePx ?? DEFAULT_SCAN_OPTIONS.clickSortTolerancePx,
    apiErrorMinStatus: partial?.apiErrorMinStatus ?? DEFAULT_SCAN_OPTIONS.apiErrorMinStatus,
    autoLoginEnabled: partial?.autoLoginEnabled ?? DEFAULT_SCAN_OPTIONS.autoLoginEnabled,
    loginProfile: partial?.loginProfile,
    loginSelectors: {
      ...DEFAULT_SCAN_OPTIONS.loginSelectors,
      ...partial?.loginSelectors,
    },
    enableRecording: partial?.enableRecording ?? DEFAULT_SCAN_OPTIONS.enableRecording,
    enableFailureScreenshot:
      partial?.enableFailureScreenshot ?? DEFAULT_SCAN_OPTIONS.enableFailureScreenshot,
    enableRouteScreenshot:
      partial?.enableRouteScreenshot ?? DEFAULT_SCAN_OPTIONS.enableRouteScreenshot,
    clickSuccessMode: partial?.clickSuccessMode ?? DEFAULT_SCAN_OPTIONS.clickSuccessMode,
  };
}

export async function getScanConfig(profileId: string): Promise<PersistedScanConfig> {
  const path = resolveProfileScanConfigPath(profileId);
  if (!existsSync(path)) {
    throw new Error("扫描配置不存在");
  }
  const raw = await readFile(path, "utf-8");
  return defaultScanConfig(JSON.parse(raw) as Partial<PersistedScanConfig>);
}

export async function saveScanConfig(
  profileId: string,
  config: PersistedScanConfig,
): Promise<PersistedScanConfig> {
  const dir = resolveProfileDir(profileId);
  await mkdir(dir, { recursive: true });
  const normalized = defaultScanConfig(config);
  await writeFile(
    resolveProfileScanConfigPath(profileId),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf-8",
  );

  const index = await readIndex();
  const meta = index.profiles.find((p) => p.id === profileId);
  if (meta) {
    meta.startUrl = normalized.startUrl;
    meta.projectId = normalized.projectId;
    meta.updatedAt = new Date().toISOString();
    await writeIndex(index);
  }

  return normalized;
}

export async function listProfiles(): Promise<ScanProfileMeta[]> {
  const index = await readIndex();
  return index.profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProfile(profileId: string): Promise<ScanProfileMeta | null> {
  const index = await readIndex();
  return index.profiles.find((p) => p.id === profileId) ?? null;
}

export async function createProfile(payload: CreateProfilePayload): Promise<ScanProfileMeta> {
  const name = payload.name?.trim();
  if (!name) throw new Error("任务名称不能为空");

  const id = randomUUID();
  const now = new Date().toISOString();
  const meta: ScanProfileMeta = {
    id,
    name,
    description: payload.description?.trim() || undefined,
    projectId: payload.projectId,
    startUrl: payload.startUrl?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(resolveProfileDir(id), { recursive: true });
  await saveScanConfig(id, defaultScanConfig({ startUrl: meta.startUrl, projectId: meta.projectId }));
  await initProfileRulesFromDefaults(id);
  await initProfileProbeSelectorsFromDefaults(id);
  await initProfileUrlExcludeFromDefaults(id);

  const index = await readIndex();
  index.profiles.unshift(meta);
  await writeIndex(index);
  return meta;
}

export async function updateProfile(
  profileId: string,
  payload: UpdateProfilePayload,
): Promise<ScanProfileMeta | null> {
  const index = await readIndex();
  const meta = index.profiles.find((p) => p.id === profileId);
  if (!meta) return null;

  if (payload.name?.trim()) meta.name = payload.name.trim();
  if (payload.description !== undefined) meta.description = payload.description.trim() || undefined;
  if (payload.projectId !== undefined) meta.projectId = payload.projectId || undefined;
  if (payload.startUrl !== undefined) {
    meta.startUrl = payload.startUrl.trim();
    const config = await getScanConfig(profileId).catch(() => defaultScanConfig());
    await saveScanConfig(profileId, { ...config, startUrl: meta.startUrl });
  }
  meta.updatedAt = new Date().toISOString();
  await writeIndex(index);
  return meta;
}

export async function deleteProfile(profileId: string): Promise<boolean> {
  const index = await readIndex();
  const idx = index.profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) return false;
  index.profiles.splice(idx, 1);
  await writeIndex(index);
  if (existsSync(resolveProfileDir(profileId))) {
    await rm(resolveProfileDir(profileId), { recursive: true, force: true });
  }
  return true;
}

export async function touchProfileAfterScan(
  profileId: string,
  summary: ScanProfileMeta["lastReportSummary"],
): Promise<void> {
  const index = await readIndex();
  const meta = index.profiles.find((p) => p.id === profileId);
  if (!meta) return;
  meta.lastScanAt = new Date().toISOString();
  meta.lastReportSummary = summary;
  meta.updatedAt = meta.lastScanAt;
  await writeIndex(index);
}

/** Migrate legacy global config into a default profile if none exist. */
export async function migrateLegacyProfilesIfNeeded(): Promise<void> {
  const index = await readIndex();
  if (index.profiles.length > 0) return;

  const legacyDir = resolveToolConfigDir();
  const hasLegacy =
    existsSync(join(legacyDir, "blacklist.json")) || existsSync(join(legacyDir, "whitelist.json"));

  const profile = await createProfile({
    name: "默认扫描任务",
    description: hasLegacy ? "从旧版全局配置迁移" : undefined,
    startUrl: "",
  });

  if (hasLegacy) {
    const targetConfigDir = resolveProfileConfigDir(profile.id);
    await mkdir(targetConfigDir, { recursive: true });
    for (const file of ["blacklist.json", "whitelist.json", "probe-selectors.json", "url-exclude.json"]) {
      const src = join(legacyDir, file);
      if (existsSync(src)) {
        await cp(src, join(targetConfigDir, file));
      }
    }
  } else {
    await getRulesConfigBundle(profile.id);
  }
}

export async function resolveProfileScanOptions(profileId: string) {
  const config = await getScanConfig(profileId);
  const rules = await getRulesConfigBundle(profileId);
  const probe = await getProbeSelectors(profileId);
  const urlExclude = await getUrlExclude(profileId);
  return {
    ...config,
    blacklistRules: rules.blacklist.rules,
    whitelistRules: rules.whitelist.rules,
    whitelistDefaultWeight: rules.whitelist.defaultWeight ?? 0,
    probeSelectors: probe.config,
    ignoreRequestRules: urlExclude.rules,
  };
}
