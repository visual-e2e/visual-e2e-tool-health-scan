import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  resolveReportDir,
  resolveReportJsonPath,
  resolveReportLogPath,
  resolveReportScreenshotsDir,
  resolveReportVideosDir,
} from "../storage/paths.js";

export async function ensureArtifactsDir(profileId: string | undefined, reportId: string): Promise<string> {
  const dir = resolveReportDir(profileId, reportId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureReportVideosDir(
  profileId: string | undefined,
  reportId: string,
): Promise<string> {
  const dir = resolveReportVideosDir(profileId, reportId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function appendReportLogLine(
  profileId: string | undefined,
  reportId: string,
  line: string,
): Promise<void> {
  const path = resolveReportLogPath(profileId, reportId);
  await mkdir(join(path, ".."), { recursive: true });
  await appendFile(path, line.endsWith("\n") ? line : `${line}\n`, "utf-8");
}

export async function captureFailureScreenshot(
  page: Page,
  profileId: string | undefined,
  reportId: string,
  issueId: string,
): Promise<string | undefined> {
  try {
    const dir = resolveReportScreenshotsDir(profileId, reportId);
    await mkdir(dir, { recursive: true });
    const filename = `issue-${issueId.slice(0, 8)}.png`;
    const path = join(dir, filename);
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return undefined;
  }
}

export async function captureRouteScreenshot(
  page: Page,
  profileId: string | undefined,
  reportId: string,
  seq: number,
): Promise<string | undefined> {
  try {
    const dir = resolveReportScreenshotsDir(profileId, reportId);
    await mkdir(dir, { recursive: true });
    const filename = `route-${String(seq).padStart(3, "0")}.png`;
    const path = join(dir, filename);
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return undefined;
  }
}

export async function writeSessionReportJson(
  profileId: string | undefined,
  reportId: string,
  data: unknown,
): Promise<string> {
  const path = resolveReportJsonPath(profileId, reportId);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return path;
}
