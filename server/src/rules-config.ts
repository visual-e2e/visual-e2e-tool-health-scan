import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  compileFromConfig,
  getDefaultBlacklistConfig,
  getDefaultWhitelistConfig,
  RuleListType,
  type BlacklistRuleFile,
  type ClickRuleConfig,
  type RuleOp,
  type RuleType,
  type WhitelistRuleFile,
} from "./types.js";
import { resolveProfileConfigDir, resolveToolConfigDir } from "./storage/paths.js";

const execFileAsync = promisify(execFile);

export interface RulesConfigBundle {
  blacklist: BlacklistRuleFile;
  whitelist: WhitelistRuleFile;
  files: {
    baseDir: string;
    blacklistPath: string;
    whitelistPath: string;
  };
}

interface SaveRulesPayload {
  blacklist: ClickRuleConfig[];
  whitelist: ClickRuleConfig[];
  whitelistDefaultWeight: number;
}

function getRulesFilePaths(profileId: string) {
  const baseDir = resolveProfileConfigDir(profileId);
  const blacklistPath = join(baseDir, "blacklist.json");
  const whitelistPath = join(baseDir, "whitelist.json");
  return { baseDir, blacklistPath, whitelistPath };
}

async function ensureRulesDir(baseDir: string): Promise<void> {
  await mkdir(baseDir, { recursive: true });
}

function normalizeRule(rule: ClickRuleConfig, index: number): ClickRuleConfig {
  return {
    ...rule,
    id: rule.id > 0 ? rule.id : index + 1,
    title: rule.title?.trim() || `规则 ${index + 1}`,
    type: rule.type as RuleType,
    op: ("op" in rule ? rule.op : undefined) as RuleOp | undefined,
  } as ClickRuleConfig;
}

async function writeBundle(
  paths: ReturnType<typeof getRulesFilePaths>,
  bundle: { blacklist: BlacklistRuleFile; whitelist: WhitelistRuleFile },
): Promise<void> {
  await writeFile(paths.blacklistPath, `${JSON.stringify(bundle.blacklist, null, 2)}\n`, "utf-8");
  await writeFile(paths.whitelistPath, `${JSON.stringify(bundle.whitelist, null, 2)}\n`, "utf-8");
}

function defaultRulesBundle() {
  const defaultWhitelist = getDefaultWhitelistConfig();
  return {
    blacklist: {
      version: 3 as const,
      rules: getDefaultBlacklistConfig(),
    },
    whitelist: {
      version: 3 as const,
      defaultWeight: defaultWhitelist.defaultWeight,
      rules: defaultWhitelist.rules,
    },
  };
}

export async function initProfileRulesFromDefaults(profileId: string): Promise<void> {
  const paths = getRulesFilePaths(profileId);
  await ensureRulesDir(paths.baseDir);
  if (!existsSync(paths.blacklistPath) || !existsSync(paths.whitelistPath)) {
    await writeBundle(paths, defaultRulesBundle());
  }
}

export async function getRulesConfigBundle(profileId: string): Promise<RulesConfigBundle> {
  const paths = getRulesFilePaths(profileId);
  await ensureRulesDir(paths.baseDir);

  const defaultBundle = defaultRulesBundle();

  if (!existsSync(paths.blacklistPath) || !existsSync(paths.whitelistPath)) {
    await writeBundle(paths, defaultBundle);
  }

  const [blackRaw, whiteRaw] = await Promise.all([
    readFile(paths.blacklistPath, "utf-8"),
    readFile(paths.whitelistPath, "utf-8"),
  ]);

  const blackJson = JSON.parse(blackRaw) as BlacklistRuleFile;
  const whiteJson = JSON.parse(whiteRaw) as WhitelistRuleFile;

  const blacklist: BlacklistRuleFile = {
    version: 3,
    rules: (blackJson.rules ?? []).map(normalizeRule),
  };
  const whitelist: WhitelistRuleFile = {
    version: 3,
    defaultWeight: Number(whiteJson.defaultWeight ?? 0),
    rules: (whiteJson.rules ?? []).map(normalizeRule),
  };

  compileFromConfig(blacklist.rules, whitelist.rules, whitelist.defaultWeight ?? 0);

  return {
    blacklist,
    whitelist,
    files: paths,
  };
}

export async function saveRulesConfig(
  profileId: string,
  payload: SaveRulesPayload,
): Promise<RulesConfigBundle> {
  const paths = getRulesFilePaths(profileId);
  await ensureRulesDir(paths.baseDir);

  const blacklist: BlacklistRuleFile = {
    version: 3,
    rules: payload.blacklist.map(normalizeRule),
  };
  const whitelist: WhitelistRuleFile = {
    version: 3,
    defaultWeight: Number(payload.whitelistDefaultWeight ?? 0),
    rules: payload.whitelist.map(normalizeRule),
  };

  compileFromConfig(blacklist.rules, whitelist.rules, whitelist.defaultWeight ?? 0);
  await writeBundle(paths, { blacklist, whitelist });
  return { blacklist, whitelist, files: paths };
}

export async function resetRulesConfigToDefault(profileId: string): Promise<RulesConfigBundle> {
  const defaultWhitelist = getDefaultWhitelistConfig();
  return saveRulesConfig(profileId, {
    blacklist: getDefaultBlacklistConfig(),
    whitelist: defaultWhitelist.rules,
    whitelistDefaultWeight: defaultWhitelist.defaultWeight,
  });
}

export async function openRulesConfigFile(profileId: string, _list: RuleListType): Promise<{ path: string }> {
  const { baseDir } = getRulesFilePaths(profileId);
  await ensureRulesDir(baseDir);
  if (!existsSync(baseDir)) {
    await getRulesConfigBundle(profileId);
  }

  const platform = process.platform;
  if (platform === "darwin") {
    await execFileAsync("open", [baseDir]);
  } else if (platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", baseDir]);
  } else {
    await execFileAsync("xdg-open", [baseDir]);
  }
  return { path: baseDir };
}

/** @deprecated legacy global rules — used only for migration reference */
export function getLegacyRulesFilePaths() {
  const baseDir = resolveToolConfigDir();
  return {
    baseDir,
    blacklistPath: join(baseDir, "blacklist.json"),
    whitelistPath: join(baseDir, "whitelist.json"),
  };
}
