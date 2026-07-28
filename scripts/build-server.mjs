#!/usr/bin/env node
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "server/dist/index.js");
mkdirSync(join(root, "server/dist"), { recursive: true });

await build({
  entryPoints: [join(root, "server/src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile,
  minify: true,
  keepNames: false,
  external: ["playwright", "playwright-core"],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log(`Server bundled → ${outfile}`);
