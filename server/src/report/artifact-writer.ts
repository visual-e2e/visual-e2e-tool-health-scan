import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import { resolveSessionArtifactsDir } from "../storage/paths.js";

export async function ensureArtifactsDir(sessionId: string): Promise<string> {
  const dir = resolveSessionArtifactsDir(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function captureFailureScreenshot(
  page: Page,
  sessionId: string,
  issueId: string,
): Promise<string | undefined> {
  try {
    const dir = await ensureArtifactsDir(sessionId);
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
  sessionId: string,
  seq: number,
): Promise<string | undefined> {
  try {
    const dir = await ensureArtifactsDir(sessionId);
    const filename = `route-${String(seq).padStart(3, "0")}.png`;
    const path = join(dir, filename);
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return undefined;
  }
}

export async function writeSessionReportJson(
  sessionId: string,
  reportId: string,
  data: unknown,
): Promise<string> {
  const dir = await ensureArtifactsDir(sessionId);
  const path = join(dir, `report-${reportId}.json`);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return path;
}
