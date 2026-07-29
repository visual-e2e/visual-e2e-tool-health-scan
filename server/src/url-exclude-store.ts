import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  getDefaultIgnoreRequestFile,
  getDefaultIgnoreRequestRules,
  normalizeIgnoreRequestRule,
  parseIgnoreRequestFile,
  RuleModuleType,
  type IgnoreRequestRule,
  type IgnoreRequestRuleFile,
} from "./types.js";
import { resolveProfileConfigDir } from "./storage/paths.js";

const FILENAME = "url-exclude.json";

export interface UrlExcludeBundle {
  rules: IgnoreRequestRule[];
  files: { path: string; baseDir: string };
}

function getUrlExcludePath(profileId: string) {
  const baseDir = resolveProfileConfigDir(profileId);
  return { baseDir, path: join(baseDir, FILENAME) };
}

function toFile(rules: IgnoreRequestRule[]): IgnoreRequestRuleFile {
  return {
    version: 1,
    type: RuleModuleType.IgnoreRequest,
    rules: rules.map((r, i) => normalizeIgnoreRequestRule(r, i)),
  };
}

export async function initProfileUrlExcludeFromDefaults(profileId: string): Promise<void> {
  const { baseDir, path } = getUrlExcludePath(profileId);
  await mkdir(baseDir, { recursive: true });
  if (!existsSync(path)) {
    await writeFile(
      path,
      `${JSON.stringify(getDefaultIgnoreRequestFile(), null, 2)}\n`,
      "utf-8",
    );
  }
}

export async function getUrlExclude(profileId: string): Promise<UrlExcludeBundle> {
  const { baseDir, path } = getUrlExcludePath(profileId);
  await mkdir(baseDir, { recursive: true });
  if (!existsSync(path)) {
    await initProfileUrlExcludeFromDefaults(profileId);
  }
  const raw = JSON.parse(await readFile(path, "utf-8")) as unknown;
  const file = parseIgnoreRequestFile(raw);
  // Persist migrated shape if legacy array was loaded
  if (Array.isArray(raw)) {
    await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
  }
  return { rules: file.rules, files: { path, baseDir } };
}

export async function saveUrlExclude(
  profileId: string,
  rules: IgnoreRequestRule[],
): Promise<UrlExcludeBundle> {
  const { baseDir, path } = getUrlExcludePath(profileId);
  await mkdir(baseDir, { recursive: true });
  const file = toFile(rules);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
  return { rules: file.rules, files: { path, baseDir } };
}

export async function resetUrlExcludeToDefault(profileId: string): Promise<UrlExcludeBundle> {
  return saveUrlExclude(profileId, getDefaultIgnoreRequestRules());
}
