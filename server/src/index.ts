import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listProjects, resolveProjectToolContext } from "./project-context.js";
import { getBrowserStatus } from "./resolve-browser.js";
import {
  getRulesConfigBundle,
  openRulesConfigFile,
  resetRulesConfigToDefault,
  saveRulesConfig,
} from "./rules-config.js";
import { createScan, deleteScan, getScan, pauseScan, resumeScan, startScan, stopScan } from "./scan-session.js";
import type { ScanOptions } from "./types.js";
import { RuleListType, type ClickRuleConfig } from "./types.js";

const port = Number(process.env.TOOL_PORT ?? "3203");
const host = "127.0.0.1";
const serveWeb = process.env.SERVE_WEB === "1";
const toolId = process.env.TOOL_ID ?? "health-scan";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

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

app.get("/api/rules", async () => getRulesConfigBundle());

app.post<{
  Body: { blacklistRules: ClickRuleConfig[]; whitelistRules: ClickRuleConfig[]; whitelistDefaultWeight: number };
}>("/api/rules", async (req, reply) => {
  try {
    return await saveRulesConfig({
      blacklist: req.body?.blacklistRules ?? [],
      whitelist: req.body?.whitelistRules ?? [],
      whitelistDefaultWeight: Number(req.body?.whitelistDefaultWeight ?? 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存规则失败";
    return reply.status(400).send({ error: message });
  }
});

app.post("/api/rules/reset", async (_req, reply) => {
  try {
    return await resetRulesConfigToDefault();
  } catch (err) {
    const message = err instanceof Error ? err.message : "恢复默认失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{ Body: { list: RuleListType } }>("/api/rules/open-file", async (req, reply) => {
  try {
    const list = req.body?.list;
    if (list !== RuleListType.Blacklist && list !== RuleListType.Whitelist) {
      return reply.status(400).send({ error: "list 参数无效" });
    }
    return await openRulesConfigFile(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : "打开规则文件失败";
    return reply.status(400).send({ error: message });
  }
});

app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/context", async (req, reply) => {
  try {
    return resolveProjectToolContext(req.params.projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取项目失败";
    return reply.status(404).send({ error: message });
  }
});

app.post<{
  Body: Partial<ScanOptions> & { startUrl?: string };
}>("/api/scans", async (req, reply) => {
  const startUrl = req.body?.startUrl?.trim();
  if (!startUrl) return reply.status(400).send({ error: "startUrl 不能为空" });
  try {
    return await createScan({ ...req.body, startUrl });
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
