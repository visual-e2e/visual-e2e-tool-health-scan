import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
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
  Body: Partial<ScanOptions> & { startUrl?: string; profileId?: string };
}>("/api/scans", async (req, reply) => {
  const profileId = req.body?.profileId?.trim();
  const startUrl = req.body?.startUrl?.trim();
  if (!profileId && !startUrl) {
    return reply.status(400).send({ error: "profileId 或 startUrl 不能为空" });
  }
  try {
    return await createScan(profileId ? { profileId } : { ...req.body, startUrl: startUrl! });
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

app.get<{ Params: { sessionId: string; filename: string } }>(
  "/api/artifacts/:sessionId/:filename",
  async (req, reply) => {
    const dir = resolveSessionArtifactsDir(req.params.sessionId);
    const filePath = join(dir, req.params.filename);
    if (!existsSync(filePath)) return reply.status(404).send({ error: "文件不存在" });
    return reply.sendFile(req.params.filename, dir);
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
