import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  getDefaultProbeSelectors,
  getGenericProbeSelectors,
  parseProbeSelectorsFile,
  type ProbeSelectorsConfig,
} from "./types.js";
import { resolveProfileConfigDir } from "./storage/paths.js";

const FILENAME = "probe-selectors.json";

export interface ProbeSelectorsBundle {
  config: ProbeSelectorsConfig;
  files: { path: string; baseDir: string };
}

function getProbeSelectorsPath(profileId: string) {
  const baseDir = resolveProfileConfigDir(profileId);
  return { baseDir, path: join(baseDir, FILENAME) };
}

export async function initProfileProbeSelectorsFromDefaults(profileId: string): Promise<void> {
  const { baseDir, path } = getProbeSelectorsPath(profileId);
  await mkdir(baseDir, { recursive: true });
  if (!existsSync(path)) {
    await writeFile(path, `${JSON.stringify(getDefaultProbeSelectors(), null, 2)}\n`, "utf-8");
  }
}

export async function getProbeSelectors(profileId: string): Promise<ProbeSelectorsBundle> {
  const { baseDir, path } = getProbeSelectorsPath(profileId);
  await mkdir(baseDir, { recursive: true });
  if (!existsSync(path)) {
    await initProfileProbeSelectorsFromDefaults(profileId);
  }
  const raw = JSON.parse(await readFile(path, "utf-8")) as unknown;
  const config = parseProbeSelectorsFile(raw);
  // Persist migrated v2 if legacy flat file was loaded
  const isLegacy =
    raw &&
    typeof raw === "object" &&
    !Array.isArray((raw as { rules?: unknown }).rules) &&
    ("clickable" in (raw as object) || "navTop" in (raw as object) || "overlay" in (raw as object));
  if (isLegacy) {
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  }
  return { config, files: { path, baseDir } };
}

export async function saveProbeSelectors(
  profileId: string,
  config: ProbeSelectorsConfig,
): Promise<ProbeSelectorsBundle> {
  const { baseDir, path } = getProbeSelectorsPath(profileId);
  await mkdir(baseDir, { recursive: true });
  const normalized = parseProbeSelectorsFile(config);
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return { config: normalized, files: { path, baseDir } };
}

export async function resetProbeSelectorsToDefault(profileId: string): Promise<ProbeSelectorsBundle> {
  return saveProbeSelectors(profileId, getDefaultProbeSelectors());
}

export async function resetProbeSelectorsToGeneric(profileId: string): Promise<ProbeSelectorsBundle> {
  return saveProbeSelectors(profileId, getGenericProbeSelectors());
}
