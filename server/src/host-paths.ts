import { dirname } from "node:path";

export interface HostRuntimeInput {
  browser_path?: string;
  ffmpeg_path?: string;
}

export interface HostDataDirInput {
  storage?: string;
  projects?: string;
  config?: string;
  e2e_root?: string;
  tools?: string;
}

let hostDataDir: HostDataDirInput | null = null;

export function setHostDataDir(input: HostDataDirInput | null | undefined): void {
  hostDataDir = input ?? null;
  if (input?.e2e_root?.trim()) {
    process.env.E2E_ROOT = input.e2e_root.trim();
  }
  if (input?.projects?.trim()) {
    process.env.PROJECTS_DIR = input.projects.trim();
  }
  if (input?.config?.trim()) {
    process.env.CONFIG_DIR = input.config.trim();
  }
  if (input?.tools?.trim()) {
    process.env.TOOLS_DIR = input.tools.trim();
  }
}

export function getHostDataDir(): HostDataDirInput | null {
  return hostDataDir;
}

/** Apply Host RPC browser/ffmpeg paths to process.env before Playwright loads. */
export function applyHostRuntimeEnv(runtime?: HostRuntimeInput): void {
  if (!runtime) return;

  const browserPath = runtime.browser_path?.trim();
  if (browserPath) {
    process.env.CHROMIUM_EXECUTABLE_PATH = browserPath;
  }

  const ffmpegPath = runtime.ffmpeg_path?.trim();
  if (ffmpegPath) {
    // .../darwin-arm64/ffmpeg-1011/ffmpeg-mac → .../darwin-arm64
    process.env.PLAYWRIGHT_BROWSERS_PATH = dirname(dirname(ffmpegPath));
  }
}

export function bootstrapHostPaths(input: {
  hostRuntime?: HostRuntimeInput;
  hostDataDir?: HostDataDirInput;
}): void {
  if (input.hostDataDir) {
    setHostDataDir(input.hostDataDir);
  }
  if (input.hostRuntime) {
    applyHostRuntimeEnv(input.hostRuntime);
  }
}
