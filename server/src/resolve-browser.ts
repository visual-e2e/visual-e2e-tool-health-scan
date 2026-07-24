import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfigDir, resolveE2eRoot, resolveRuntime, resolveSettingsPath } from "./paths.js";

export interface BrowserSettings {
  headless: boolean;
  slowMo: number;
  devtools: boolean;
  timeout: number;
  actionTimeout: number;
  viewport: { width: number; height: number };
}

export interface BrowserLaunchResolution {
  ok: boolean;
  executablePath?: string;
  env: Record<string, string>;
  path: string;
  version: string;
  hints: string[];
  settings: BrowserSettings;
}

const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  headless: false,
  slowMo: 0,
  devtools: false,
  timeout: 30_000,
  actionTimeout: 10_000,
  viewport: { width: 1280, height: 720 },
};

type BrowserRuntimeLib = {
  resolveLaunchEnv: (
    configDir: string,
    e2eRoot: string,
    runtime: string,
  ) => Promise<{
    ok: boolean;
    check: { path: string; version: string; hints: string[] };
    env: Record<string, string>;
  }>;
};

async function loadBrowserRuntimeLib(e2eRoot: string): Promise<BrowserRuntimeLib> {
  const modPath = join(e2eRoot, "scripts/lib/browser-runtime.mjs");
  if (!existsSync(modPath)) {
    throw new Error(`browser-runtime 模块未找到: ${modPath}`);
  }
  return import(pathToFileURL(modPath).href) as Promise<BrowserRuntimeLib>;
}

function readBrowserSettings(configDir: string): BrowserSettings {
  const settingsPath = resolveSettingsPath(configDir);
  if (!existsSync(settingsPath)) return { ...DEFAULT_BROWSER_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      browser?: Partial<BrowserSettings>;
    };
    const browser = raw.browser ?? {};
    return {
      ...DEFAULT_BROWSER_SETTINGS,
      ...browser,
      viewport: { ...DEFAULT_BROWSER_SETTINGS.viewport, ...(browser.viewport ?? {}) },
    };
  } catch {
    return { ...DEFAULT_BROWSER_SETTINGS };
  }
}

export async function resolveBrowserLaunch(): Promise<BrowserLaunchResolution> {
  const e2eRoot = resolveE2eRoot();
  const configDir = resolveConfigDir(e2eRoot);
  const runtime = resolveRuntime();
  const settings = readBrowserSettings(configDir);

  const customExecutable = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (customExecutable) {
    return {
      ok: true,
      executablePath: customExecutable,
      env: { CHROMIUM_EXECUTABLE_PATH: customExecutable },
      path: customExecutable,
      version: "",
      hints: [],
      settings,
    };
  }

  if (existsSync(join(e2eRoot, "scripts/lib/browser-runtime.mjs"))) {
    const lib = await loadBrowserRuntimeLib(e2eRoot);
    const resolved = await lib.resolveLaunchEnv(configDir, e2eRoot, runtime);
    const check = resolved.check ?? { path: "", version: "", hints: [] as string[] };

    if (resolved.ok) {
      const executablePath =
        resolved.env.CHROMIUM_EXECUTABLE_PATH?.trim() || check.path?.trim() || undefined;
      return {
        ok: true,
        executablePath,
        env: resolved.env,
        path: check.path,
        version: check.version,
        hints: [],
        settings,
      };
    }

    return {
      ok: false,
      env: {},
      path: check.path,
      version: check.version,
      hints: check.hints.length ? check.hints : ["测试浏览器未就绪，请先在主项目安装或配置浏览器"],
      settings,
    };
  }

  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (browsersPath) {
    return {
      ok: true,
      env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      path: browsersPath,
      version: "",
      hints: [],
      settings,
    };
  }

  return {
    ok: false,
    env: {},
    path: "",
    version: "",
    hints: ["测试浏览器未就绪，请先在主项目安装或配置浏览器"],
    settings,
  };
}

export async function getBrowserStatus(): Promise<{
  ok: boolean;
  path: string;
  version: string;
  hints: string[];
}> {
  const result = await resolveBrowserLaunch();
  return {
    ok: result.ok,
    path: result.path,
    version: result.version,
    hints: result.hints,
  };
}
