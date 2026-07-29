import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listProjects, resolveProjectLoginDefaults, resolveProjectToolContext } from "./project-context.js";
import { getBrowserStatus } from "./resolve-browser.js";
import {
  getRulesConfigBundle,
  openRulesConfigFile,
  resetRulesConfigToDefault,
  saveRulesConfig,
} from "./rules-config.js";
import {
  getProbeSelectors,
  resetProbeSelectorsToDefault,
  resetProbeSelectorsToGeneric,
  saveProbeSelectors,
} from "./probe-selectors-store.js";
import {
  getUrlExclude,
  resetUrlExcludeToDefault,
  saveUrlExclude,
} from "./url-exclude-store.js";
import {
  createProfile,
  deleteProfile,
  getProfile,
  getScanConfig,
  listProfiles,
  migrateLegacyProfilesIfNeeded,
  saveScanConfig,
  updateProfile,
} from "./profile/profile-store.js";
import { createScan, deleteScan, getScan, pauseScan, resumeScan, startScan, stopScan } from "./scan-session.js";
import {
  deleteReport,
  getReport,
  listReports,
  openReportsDir,
  updateReport,
} from "./report/report-store.js";
import { migrateLegacyConfigIfNeeded, resolveSessionArtifactsDir } from "./storage/paths.js";
import { bootstrapHostPaths } from "./host-paths.js";
import type {
  CreateProfilePayload,
  PersistedScanConfig,
  ProbeSelectorsConfig,
  ScanOptions,
  UpdateProfilePayload,
  UpdateReportPayload,
} from "./types.js";
import { RuleListType, type ClickRuleConfig } from "./types.js";

const port = Number(process.env.TOOL_PORT ?? "3203");
const host = "127.0.0.1";
const serveWeb = process.env.SERVE_WEB === "1";
const toolId = process.env.TOOL_ID ?? "health-scan";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toAssetHref(sessionId: string, fullPath: string | undefined, baseDir: string): string {
  if (!fullPath || !baseDir) return "";
  if (!fullPath.startsWith(baseDir)) return "";
  const rel = fullPath.slice(baseDir.length).replace(/^\/+/, "");
  const safeRel = rel
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/artifacts/${encodeURIComponent(sessionId)}/${safeRel}`;
}

function renderReportHtml(report: Awaited<ReturnType<typeof getReport>>): string {
  if (!report || !report.session) {
    return `<!doctype html><html><body><h2>报告不可用</h2></body></html>`;
  }
  const s = report.session;
  const categoryLabel: Record<string, string> = {
    network: "网络", layout: "布局", click: "点击", runtime: "运行时",
  };
  const categoryColor: Record<string, string> = {
    network: "#2563eb", layout: "#d97706", click: "#7c3aed", runtime: "#dc2626",
  };
  const severityColor: Record<string, string> = { error: "#dc2626", warning: "#d97706" };
  const outcomeColor: Record<string, string> = {
    success: "#16a34a", failed: "#dc2626", skipped: "#6b7280",
  };
  const outcomeLabel: Record<string, string> = {
    success: "成功", failed: "失败", skipped: "跳过",
  };

  const badge = (text: string, bg: string, fg = "#fff") =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;background:${bg};color:${fg}">${escapeHtml(text)}</span>`;

  const issuesRows = (s.issues ?? [])
    .map(
      (i) => `<tr>
        <td>${badge(categoryLabel[i.category] ?? i.category, categoryColor[i.category] ?? "#6b7280")}</td>
        <td>${badge(i.severity === "error" ? "错误" : "警告", severityColor[i.severity] ?? "#6b7280")}</td>
        <td>${escapeHtml(i.title)}</td>
        <td style="font-size:12px;color:#6b7280">${escapeHtml(i.pageUrl || "")}</td>
        <td><pre style="font-size:12px">${escapeHtml(i.detail || "")}</pre></td>
      </tr>`,
    )
    .join("");
  const actionsRows = (s.clickActions ?? [])
    .map(
      (a) => `<tr>
        <td>${badge(outcomeLabel[a.outcome] ?? a.outcome, outcomeColor[a.outcome] ?? "#6b7280")}</td>
        <td>${escapeHtml(a.target?.label || "")}</td>
        <td style="color:#dc2626;font-size:12px">${escapeHtml(a.error || "")}</td>
      </tr>`,
    )
    .join("");
  const logPath = join(report.artifactsDir, "logs", "run.log");
  const logs = existsSync(logPath) ? readFileSync(logPath, "utf-8") : "";
  const videoHref = toAssetHref(report.sessionId, report.videoPath, report.artifactsDir);

  const statusBg: Record<string, string> = {
    done: "#16a34a", error: "#dc2626", cancelled: "#6b7280",
    running: "#2563eb", stopping: "#d97706", ready: "#6b7280",
  };

  const statItems = [
    { label: "网络", value: s.summary.network, color: "#2563eb" },
    { label: "布局", value: s.summary.layout, color: "#d97706" },
    { label: "点击", value: s.summary.click, color: "#7c3aed" },
    { label: "运行时", value: s.summary.runtime, color: "#dc2626" },
  ];
  const statCards = statItems
    .map(
      (it) => `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;background:#fff;border-left:4px solid ${it.color}">
        <div style="font-size:13px;color:#6b7280;margin-bottom:4px">${it.label}问题</div>
        <div style="font-size:28px;font-weight:700;color:${it.color}">${it.value}</div>
      </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.name)} - 健康扫描报告</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f6f8fa; color: #1f2328; }
    .header { background: linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%); color:#fff; padding: 24px 32px; }
    .header h1 { margin:0 0 8px; font-size:22px; font-weight:700; }
    .header-meta { display:flex; gap:24px; flex-wrap:wrap; font-size:13px; opacity:.85; }
    .header-meta span b { opacity:.7; margin-right:4px; }
    .status-badge { display:inline-block;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600; }
    .content { max-width:1100px; margin:0 auto; padding:24px 24px; }
    .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    .card { border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px; background:#fff; }
    .card h2 { margin:0 0 12px; font-size:15px; color:#374151; border-bottom:1px solid #f3f4f6; padding-bottom:8px; }
    table { width:100%; border-collapse: collapse; font-size:13px; }
    th { background:#f9fafb; color:#6b7280; font-weight:600; text-align:left; padding:8px 10px; border-bottom:2px solid #e5e7eb; }
    td { padding:8px 10px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
    tr:last-child td { border-bottom:none; }
    tr:hover td { background:#fafbff; }
    pre { white-space:pre-wrap; word-break:break-word; margin:0; font-size:12px; line-height:1.6; }
    video { width:100%; max-width:960px; border-radius:8px; background:#000; display:block; }
    .log-pre { background:#0d1117; color:#e6edf3; border-radius:8px; padding:16px; font-size:12px; line-height:1.7; overflow-x:auto; }
    @media(max-width:700px) { .stat-grid { grid-template-columns:repeat(2,1fr); } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(report.name)}</h1>
    <div class="header-meta">
      <span><b>状态</b><span class="status-badge" style="background:${statusBg[report.status] ?? "#6b7280"}">${escapeHtml(report.status)}</span></span>
      <span><b>时间</b>${escapeHtml(new Date(report.createdAt).toLocaleString("zh-CN"))}</span>
      <span><b>入口</b>${escapeHtml(report.startUrl)}</span>
    </div>
  </div>

  <div class="content">
    <div class="stat-grid">${statCards}</div>

    <div class="card">
      <h2>🎬 录屏</h2>
      ${
        videoHref
          ? `<video controls src="${videoHref}"></video>`
          : `<div style="color:#9ca3af;padding:24px 0;text-align:center">未生成录屏</div>`
      }
    </div>

    <div class="card">
      <h2>🐛 问题列表</h2>
      <table>
        <thead><tr><th>类别</th><th>级别</th><th>标题</th><th>页面</th><th>详情</th></tr></thead>
        <tbody>${issuesRows || `<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px">无问题</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>🖱 点击日志</h2>
      <table>
        <thead><tr><th>结果</th><th>目标</th><th>错误</th></tr></thead>
        <tbody>${actionsRows || `<tr><td colspan="3" style="text-align:center;color:#9ca3af;padding:20px">无点击日志</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>📋 运行日志</h2>
      <pre class="log-pre">${escapeHtml(logs || "暂无日志")}</pre>
    </div>
  </div>
</body>
</html>`;
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await migrateLegacyConfigIfNeeded();
await migrateLegacyProfilesIfNeeded();

app.get("/api/health", async () => ({
  ok: true,
  toolId,
  name: "健康扫描",
  version: "1.0.0",
  port,
}));

app.get("/api/info", async () => ({
  id: toolId,
  name: "健康扫描",
  description: "扫描静态资源 404、接口报错、CSS/布局异常与带权重规则的暴力点击探测",
  version: "1.0.0",
}));

app.get("/api/browser/status", async () => getBrowserStatus());

app.post<{
  Body: {
    hostRuntime?: { browser_path?: string; ffmpeg_path?: string };
    hostDataDir?: {
      storage?: string;
      projects?: string;
      config?: string;
      e2e_root?: string;
      tools?: string;
    };
  };
}>("/api/host/bootstrap", async (req) => {
  bootstrapHostPaths({
    hostRuntime: req.body?.hostRuntime,
    hostDataDir: req.body?.hostDataDir,
  });
  return { ok: true };
});

app.get("/api/projects", async () => ({ projects: listProjects() }));

app.get("/api/profiles", async () => ({ profiles: await listProfiles() }));

app.post<{ Body: CreateProfilePayload }>("/api/profiles", async (req, reply) => {
  try {
    return await createProfile(req.body ?? { name: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建任务失败";
    return reply.status(400).send({ error: message });
  }
});

app.get<{ Params: { profileId: string } }>("/api/profiles/:profileId", async (req, reply) => {
  const profile = await getProfile(req.params.profileId);
  if (!profile) return reply.status(404).send({ error: "任务不存在" });
  return profile;
});

app.patch<{ Params: { profileId: string }; Body: UpdateProfilePayload }>(
  "/api/profiles/:profileId",
  async (req, reply) => {
    const updated = await updateProfile(req.params.profileId, req.body ?? {});
    if (!updated) return reply.status(404).send({ error: "任务不存在" });
    return updated;
  },
);

app.delete<{ Params: { profileId: string } }>("/api/profiles/:profileId", async (req, reply) => {
  const ok = await deleteProfile(req.params.profileId);
  if (!ok) return reply.status(404).send({ error: "任务不存在" });
  return { ok: true };
});

app.get<{ Params: { profileId: string } }>(
  "/api/profiles/:profileId/scan-config",
  async (req, reply) => {
    try {
      return await getScanConfig(req.params.profileId);
    } catch {
      return reply.status(404).send({ error: "扫描配置不存在" });
    }
  },
);

app.put<{ Params: { profileId: string }; Body: PersistedScanConfig }>(
  "/api/profiles/:profileId/scan-config",
  async (req, reply) => {
    try {
      return await saveScanConfig(req.params.profileId, req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存扫描配置失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.get<{ Params: { profileId: string } }>("/api/profiles/:profileId/rules", async (req, reply) => {
  try {
    return await getRulesConfigBundle(req.params.profileId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取规则失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{
  Params: { profileId: string };
  Body: { blacklistRules: ClickRuleConfig[]; whitelistRules: ClickRuleConfig[]; whitelistDefaultWeight: number };
}>("/api/profiles/:profileId/rules", async (req, reply) => {
  try {
    return await saveRulesConfig(req.params.profileId, {
      blacklist: req.body?.blacklistRules ?? [],
      whitelist: req.body?.whitelistRules ?? [],
      whitelistDefaultWeight: Number(req.body?.whitelistDefaultWeight ?? 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存规则失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{ Params: { profileId: string } }>(
  "/api/profiles/:profileId/rules/reset",
  async (req, reply) => {
    try {
      return await resetRulesConfigToDefault(req.params.profileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "恢复默认失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.post<{ Params: { profileId: string }; Body: { list: RuleListType } }>(
  "/api/profiles/:profileId/rules/open-file",
  async (req, reply) => {
    try {
      const list = req.body?.list;
      if (list !== RuleListType.Blacklist && list !== RuleListType.Whitelist) {
        return reply.status(400).send({ error: "list 参数无效" });
      }
      return await openRulesConfigFile(req.params.profileId, list);
    } catch (err) {
      const message = err instanceof Error ? err.message : "打开规则文件失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.get<{ Params: { profileId: string } }>(
  "/api/profiles/:profileId/probe-selectors",
  async (req, reply) => {
    try {
      return await getProbeSelectors(req.params.profileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "读取探测选择器失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.put<{ Params: { profileId: string }; Body: ProbeSelectorsConfig }>(
  "/api/profiles/:profileId/probe-selectors",
  async (req, reply) => {
    try {
      return await saveProbeSelectors(req.params.profileId, req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存探测选择器失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.post<{ Params: { profileId: string }; Body: { mode?: "default" | "generic" } }>(
  "/api/profiles/:profileId/probe-selectors/reset",
  async (req, reply) => {
    try {
      if (req.body?.mode === "generic") {
        return await resetProbeSelectorsToGeneric(req.params.profileId);
      }
      return await resetProbeSelectorsToDefault(req.params.profileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "恢复探测选择器失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.get<{ Params: { profileId: string } }>(
  "/api/profiles/:profileId/url-exclude",
  async (req, reply) => {
    try {
      return await getUrlExclude(req.params.profileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "读取忽略请求失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.put<{ Params: { profileId: string }; Body: { rules: import("./types.js").IgnoreRequestRule[] } }>(
  "/api/profiles/:profileId/url-exclude",
  async (req, reply) => {
    try {
      return await saveUrlExclude(req.params.profileId, req.body?.rules ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存忽略请求失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.post<{ Params: { profileId: string } }>(
  "/api/profiles/:profileId/url-exclude/reset",
  async (req, reply) => {
    try {
      return await resetUrlExcludeToDefault(req.params.profileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "恢复忽略请求失败";
      return reply.status(400).send({ error: message });
    }
  },
);

app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/context", async (req, reply) => {
  try {
    return resolveProjectToolContext(req.params.projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取项目失败";
    return reply.status(404).send({ error: message });
  }
});

app.get<{ Params: { projectId: string } }>(
  "/api/projects/:projectId/login-defaults",
  async (req, reply) => {
    try {
      return resolveProjectLoginDefaults(req.params.projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "读取登录默认值失败";
      return reply.status(404).send({ error: message });
    }
  },
);

app.post<{
  Body: Partial<ScanOptions> & {
    startUrl?: string;
    profileId?: string;
    hostRuntime?: { browser_path?: string; ffmpeg_path?: string };
    hostDataDir?: {
      storage?: string;
      projects?: string;
      config?: string;
      e2e_root?: string;
      tools?: string;
    };
  };
}>("/api/scans", async (req, reply) => {
  const profileId = req.body?.profileId?.trim();
  const startUrl = req.body?.startUrl?.trim();
  if (!profileId && !startUrl) {
    return reply.status(400).send({ error: "profileId 或 startUrl 不能为空" });
  }
  try {
    return await createScan({
      ...(profileId ? { profileId } : { ...req.body, startUrl: startUrl! }),
      hostRuntime: req.body?.hostRuntime,
      hostDataDir: req.body?.hostDataDir,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建扫描失败";
    return reply.status(400).send({ error: message });
  }
});

app.get<{ Params: { sessionId: string } }>("/api/scans/:sessionId", async (req, reply) => {
  const session = getScan(req.params.sessionId);
  if (!session) return reply.status(404).send({ error: "会话不存在" });
  return session;
});

app.post<{ Params: { sessionId: string } }>("/api/scans/:sessionId/start", async (req, reply) => {
  try {
    return startScan(req.params.sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "开始扫描失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{ Params: { sessionId: string } }>("/api/scans/:sessionId/pause", async (req, reply) => {
  try {
    return pauseScan(req.params.sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "暂停失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{ Params: { sessionId: string } }>("/api/scans/:sessionId/resume", async (req, reply) => {
  try {
    return resumeScan(req.params.sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "继续失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{ Params: { sessionId: string } }>("/api/scans/:sessionId/stop", async (req, reply) => {
  try {
    return await stopScan(req.params.sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "停止失败";
    return reply.status(400).send({ error: message });
  }
});

app.delete<{ Params: { sessionId: string } }>("/api/scans/:sessionId", async (req) => {
  await deleteScan(req.params.sessionId);
  return { ok: true };
});

app.get<{ Querystring: { profileId?: string } }>("/api/reports", async (req) => ({
  reports: await listReports(req.query.profileId),
}));

app.get<{ Params: { reportId: string } }>("/api/reports/:reportId", async (req, reply) => {
  const report = await getReport(req.params.reportId);
  if (!report) return reply.status(404).send({ error: "报告不存在" });
  return report;
});

app.get<{ Params: { reportId: string } }>("/api/reports/:reportId/html", async (req, reply) => {
  const report = await getReport(req.params.reportId);
  if (!report) return reply.status(404).send({ error: "报告不存在" });
  const html = renderReportHtml(report);
  return reply.header("content-type", "text/html; charset=utf-8").send(html);
});

app.patch<{ Params: { reportId: string }; Body: UpdateReportPayload }>(
  "/api/reports/:reportId",
  async (req, reply) => {
    const updated = await updateReport(req.params.reportId, req.body ?? {});
    if (!updated) return reply.status(404).send({ error: "报告不存在" });
    return updated;
  },
);

app.delete<{ Params: { reportId: string } }>("/api/reports/:reportId", async (req, reply) => {
  const ok = await deleteReport(req.params.reportId);
  if (!ok) return reply.status(404).send({ error: "报告不存在" });
  return { ok: true };
});

app.post("/api/reports/open-dir", async () => {
  const dir = await openReportsDir();
  const platform = process.platform;
  if (platform === "darwin") {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("open", [dir]);
  } else if (platform === "win32") {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("cmd", ["/c", "start", "", dir]);
  } else {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("xdg-open", [dir]);
  }
  return { path: dir };
});

app.get<{ Params: { sessionId: string; "*": string } }>(
  "/api/artifacts/:sessionId/*",
  async (req, reply) => {
    const dir = resolveSessionArtifactsDir(req.params.sessionId);
    const relPath = req.params["*"] || "";
    const filePath = join(dir, relPath);
    if (!existsSync(filePath)) return reply.status(404).send({ error: "文件不存在" });
    return reply.sendFile(relPath, dir);
  },
);

if (serveWeb) {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html", webRoot);
    });
  }
}

await app.listen({ port, host });
console.log(`[${toolId}] http://${host}:${port}`);
