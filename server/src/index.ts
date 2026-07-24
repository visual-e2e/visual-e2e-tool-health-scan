import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listProjects, resolveProjectToolContext } from "./project-context.js";
import { getBrowserStatus } from "./resolve-browser.js";
import { createScan, deleteScan, getScan, stopScan } from "./scan-session.js";
import type { ScanOptions } from "./types.js";

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
  description: "扫描静态资源 404、接口 5xx、页面错乱与失效点击",
  version: "1.0.0",
}));

app.get("/api/browser/status", async () => getBrowserStatus());

app.get("/api/projects", async () => ({ projects: listProjects() }));

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
