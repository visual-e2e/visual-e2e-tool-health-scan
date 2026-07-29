import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ReportMeta, ReportRecord, ScanSessionView, UpdateReportPayload } from "../types.js";
import { resolveReportDir, resolveToolReportsDir } from "../storage/paths.js";
import { writeSessionReportJson } from "./artifact-writer.js";

const INDEX_FILE = "index.json";

interface ReportIndex {
  reports: ReportMeta[];
}

async function readIndex(): Promise<ReportIndex> {
  const dir = resolveToolReportsDir();
  await mkdir(dir, { recursive: true });
  const indexPath = join(dir, INDEX_FILE);
  if (!existsSync(indexPath)) return { reports: [] };
  const raw = await readFile(indexPath, "utf-8");
  return JSON.parse(raw) as ReportIndex;
}

async function writeIndex(index: ReportIndex): Promise<void> {
  const dir = resolveToolReportsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

function defaultReportName(session: ScanSessionView): string {
  const date = new Date(session.startedAt).toLocaleString("zh-CN");
  const host = (() => {
    try {
      return new URL(session.startUrl).host;
    } catch {
      return session.startUrl.slice(0, 40);
    }
  })();
  return `${host} · ${date}`;
}

export async function saveReportFromSession(
  session: ScanSessionView,
  extra?: {
    name?: string;
    description?: string;
    projectId?: string;
    profileId?: string;
    reportId?: string;
  },
): Promise<ReportMeta> {
  const reportId = extra?.reportId?.trim() || randomUUID();
  const now = new Date().toISOString();
  const artifactsDir = resolveReportDir(extra?.projectId, reportId);
  const reportPath = await writeSessionReportJson(extra?.projectId, reportId, session);
  const copiedVideoPath = await copyVideoIfExists(session.videoPath, artifactsDir);

  const meta: ReportMeta = {
    id: reportId,
    name: extra?.name?.trim() || defaultReportName(session),
    description: extra?.description?.trim(),
    sessionId: session.sessionId,
    status: session.status,
    startUrl: session.startUrl,
    projectId: extra?.projectId,
    profileId: extra?.profileId,
    createdAt: now,
    updatedAt: now,
    summary: session.summary,
    reportPath,
    artifactsDir,
    videoPath: copiedVideoPath || session.videoPath,
  };

  const index = await readIndex();
  index.reports.unshift(meta);
  await writeIndex(index);
  return meta;
}

export async function listReports(profileId?: string): Promise<ReportMeta[]> {
  const index = await readIndex();
  let reports = index.reports;
  if (profileId) {
    reports = reports.filter((r) => r.profileId === profileId);
  }
  return reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReport(reportId: string): Promise<ReportRecord | null> {
  const index = await readIndex();
  const meta = index.reports.find((r) => r.id === reportId);
  if (!meta) return null;
  if (!existsSync(meta.reportPath)) return { ...meta, session: null as unknown as ScanSessionView };
  const raw = await readFile(meta.reportPath, "utf-8");
  const session = JSON.parse(raw) as ScanSessionView;
  return { ...meta, session };
}

export async function updateReport(
  reportId: string,
  payload: UpdateReportPayload,
): Promise<ReportMeta | null> {
  const index = await readIndex();
  const meta = index.reports.find((r) => r.id === reportId);
  if (!meta) return null;
  if (payload.name?.trim()) meta.name = payload.name.trim();
  if (payload.description !== undefined) meta.description = payload.description.trim() || undefined;
  meta.updatedAt = new Date().toISOString();
  await writeIndex(index);
  return meta;
}

export async function deleteReport(reportId: string): Promise<boolean> {
  const index = await readIndex();
  const idx = index.reports.findIndex((r) => r.id === reportId);
  if (idx < 0) return false;
  const [removed] = index.reports.splice(idx, 1);
  await writeIndex(index);
  if (existsSync(removed.artifactsDir)) {
    await rm(removed.artifactsDir, { recursive: true, force: true });
  }
  return true;
}

export async function openReportsDir(): Promise<string> {
  const dir = resolveToolReportsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function copyVideoIfExists(videoPath: string | undefined, reportDir: string): Promise<string | undefined> {
  if (!videoPath || !existsSync(videoPath)) return undefined;
  const targetDir = join(reportDir, "videos");
  await mkdir(targetDir, { recursive: true });
  const target = join(targetDir, basename(videoPath) || "scan.webm");
  try {
    await copyFile(videoPath, target);
    return target;
  } catch {
    return undefined;
  }
}
