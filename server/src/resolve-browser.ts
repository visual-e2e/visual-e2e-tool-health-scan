import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { HostRuntimeInput } from "./host-paths.js";
import { applyHostRuntimeEnv } from "./host-paths.js";
import { resolveHostConfigDir, resolveE2eRoot, resolveRuntime, resolveSettingsPath } from "./paths.js";

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
    check: { path: string; version: string; hints: string[]; mode?: string };
    env: Record<string, string>;
  }>;
  resolveEffectiveManagedBrowsersDir?: (
    configDir: string,
    e2eRoot: string,
    runtime: string,
  ) => string;
  resolveEffectiveFfmpegDir?: (configDir: string, e2eRoot: string, runtime: string) => string;
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

function platformKey(): string {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (process.platform === "win32") return "win32-x64";
  return `${process.platform}-${process.arch}`;
}

/** Host managed browsers dir (Application Support/…/playwright-browsers/…). */
function inferManagedBrowsersPath(configDir: string): string | undefined {
  const key = platformKey();
  const candidates = [
    join(dirname(dirname(configDir)), "playwright-browsers", key),
    join(dirname(configDir), "playwright-browsers", key),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

function withBrowsersPath(
  env: Record<string, string>,
  configDir: string,
  fallback?: string,
): Record<string, string> {
  if (env.PLAYWRIGHT_BROWSERS_PATH?.trim()) return env;
  const path =
    process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() ||
    fallback?.trim() ||
    inferManagedBrowsersPath(configDir);
  if (!path) return env;
  return { ...env, PLAYWRIGHT_BROWSERS_PATH: path };
}

function envFromHostRuntime(hostRuntime?: HostRuntimeInput): Record<string, string> {
  const env: Record<string, string> = {};
  const browserPath = hostRuntime?.browser_path?.trim();
  const ffmpegPath = hostRuntime?.ffmpeg_path?.trim();
  if (browserPath) env.CHROMIUM_EXECUTABLE_PATH = browserPath;
  if (ffmpegPath) env.PLAYWRIGHT_BROWSERS_PATH = dirname(dirname(ffmpegPath));
  return env;
}

export async function resolveBrowserLaunch(
  hostRuntime?: HostRuntimeInput,
): Promise<BrowserLaunchResolution> {
  applyHostRuntimeEnv(hostRuntime);

  const e2eRoot = resolveE2eRoot();
  const configDir = resolveHostConfigDir(e2eRoot);
  const runtime = resolveRuntime();
  const settings = readBrowserSettings(configDir);
  const hostEnv = envFromHostRuntime(hostRuntime);
  const runtimeMod = join(e2eRoot, "scripts/lib/browser-runtime.mjs");

  if (hostRuntime?.browser_path?.trim() && hostRuntime?.ffmpeg_path?.trim()) {
    const executablePath = hostRuntime.browser_path.trim();
    return {
      ok: true,
      executablePath,
      env: { ...hostEnv },
      path: executablePath,
      version: "",
      hints: [],
      settings,
    };
  }

  if (existsSync(runtimeMod)) {
    const lib = await loadBrowserRuntimeLib(e2eRoot);
    const resolved = await lib.resolveLaunchEnv(configDir, e2eRoot, runtime);
    const check = resolved.check ?? { path: "", version: "", hints: [] as string[] };

    if (resolved.ok) {
      let env = withBrowsersPath({ ...resolved.env, ...hostEnv }, configDir);
      const overrideExe = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
      if (overrideExe) {
        env = { ...env, CHROMIUM_EXECUTABLE_PATH: overrideExe };
      }
      const executablePath =
        env.CHROMIUM_EXECUTABLE_PATH?.trim() || check.path?.trim() || undefined;
      return {
        ok: true,
        executablePath,
        env,
        path: check.path || env.PLAYWRIGHT_BROWSERS_PATH || executablePath || "",
        version: check.version,
        hints: [],
        settings,
      };
    }

    const customExecutable =
      hostRuntime?.browser_path?.trim() || process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
    const managed =
      hostEnv.PLAYWRIGHT_BROWSERS_PATH ||
      lib.resolveEffectiveFfmpegDir?.(configDir, e2eRoot, runtime) ||
      lib.resolveEffectiveManagedBrowsersDir?.(configDir, e2eRoot, runtime) ||
      inferManagedBrowsersPath(configDir);
    if (customExecutable && managed) {
      return {
        ok: true,
        executablePath: customExecutable,
        env: withBrowsersPath({ CHROMIUM_EXECUTABLE_PATH: customExecutable, ...hostEnv }, configDir, managed),
        path: customExecutable,
        version: "",
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

  const browsersPath =
    hostEnv.PLAYWRIGHT_BROWSERS_PATH ||
    process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() ||
    inferManagedBrowsersPath(configDir);
  const customExecutable =
    hostRuntime?.browser_path?.trim() || process.env.CHROMIUM_EXECUTABLE_PATH?.trim();

  if (customExecutable || browsersPath) {
    const env = withBrowsersPath(
      customExecutable ? { CHROMIUM_EXECUTABLE_PATH: customExecutable, ...hostEnv } : { ...hostEnv },
      configDir,
      browsersPath,
    );
    return {
      ok: true,
      executablePath: customExecutable,
      env,
      path: customExecutable || browsersPath || "",
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

export async function getBrowserStatus(hostRuntime?: HostRuntimeInput): Promise<{
  ok: boolean;
  path: string;
  version: string;
  hints: string[];
}> {
  const result = await resolveBrowserLaunch(hostRuntime);
  return {
    ok: result.ok,
    path: result.path,
    version: result.version,
    hints: result.hints,
  };
}
