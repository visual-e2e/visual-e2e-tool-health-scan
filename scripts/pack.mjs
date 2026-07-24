#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WARN_BYTES = 5 * 1024 * 1024;
const FAIL_BYTES = 15 * 1024 * 1024;

const build = spawnSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const manifest = JSON.parse(readFileSync(join(root, "tool.json"), "utf-8"));
const id = manifest.id;
const version = manifest.version;
if (!id || !version || String(id).includes("__")) {
  console.error("tool.json id/version 未替换，请先通过 vet init tool 生成项目");
  process.exit(1);
}

const staging = join(root, ".pack-staging");
const outDir = join(root, "dist");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(root, "tool.json"), join(staging, "tool.json"));
writeFileSync(
  join(staging, "package.json"),
  `${JSON.stringify({ name: manifest.id, version, type: "module", private: true }, null, 2)}\n`,
);
cpSync(join(root, "server/dist"), join(staging, "server/dist"), { recursive: true });
cpSync(join(root, "web/dist"), join(staging, "web/dist"), { recursive: true });

if (existsSync(join(staging, "node_modules"))) {
  console.error("pack staging must not contain node_modules");
  process.exit(1);
}
if (existsSync(join(staging, "server", "src")) || existsSync(join(staging, "web", "src"))) {
  console.error("pack staging must not contain src");
  process.exit(1);
}

const zipName = `${id}-${version}.vettool.zip`;
const zipPath = join(outDir, zipName);
rmSync(zipPath, { force: true });

if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: "pipe" },
  );
} else {
  execFileSync("zip", ["-r", "-9", zipPath, "."], { cwd: staging, stdio: "pipe" });
}

rmSync(staging, { recursive: true, force: true });
const size = statSync(zipPath).size;
console.log(`Packed ${zipName} (${(size / 1024).toFixed(1)} KiB)`);
if (size > FAIL_BYTES) {
  console.error(`Package too large (>${FAIL_BYTES / 1024 / 1024} MiB)`);
  process.exit(1);
}
if (size > WARN_BYTES) {
  console.warn(`Warning: package > ${WARN_BYTES / 1024 / 1024} MiB`);
}
