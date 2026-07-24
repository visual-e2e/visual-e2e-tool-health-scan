#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.TOOL_PORT ?? "3203";
const webPort = process.env.TOOL_WEB_PORT ?? "5203";

const env = {
  ...process.env,
  TOOL_ID: process.env.TOOL_ID ?? "health-scan",
  TOOL_PORT: String(port),
  TOOL_WEB_PORT: String(webPort),
};

const children = [
  spawn("npx", ["tsx", "watch", "server/src/index.ts"], { cwd: root, stdio: "inherit", env }),
  spawn("npx", ["vite", "--config", "web/vite.config.ts"], { cwd: root, stdio: "inherit", env }),
];

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

children[0].on("exit", (code) => {
  if (code && code !== 0) shutdown("SIGTERM");
});
