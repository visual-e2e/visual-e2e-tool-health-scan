/** Tool ↔ Host RPC protocol (iframe postMessage). */

export const RPC_PROTOCOL_VERSION = 1;

export const RPC_CHANNEL = "vet-rpc" as const;

export const RpcMethod = {
  ProjectGetContext: "project.getContext",
  ProjectList: "project.list",
  ProjectGetVariables: "project.getVariables",
  ConfigGetSettings: "config.getSettings",
  ConfigGetBrowserRuntime: "config.getBrowserRuntime",
  FsPickFolder: "fs.pickFolder",
  CacheClear: "cache.clear",
  ScenarioNavigate: "scenario.navigate",
} as const;
export type RpcMethod = (typeof RpcMethod)[keyof typeof RpcMethod];

/** Capability ids declared in tool.json (subset may map 1:1 to methods). */
export const ToolCapability = {
  ProjectContext: "project.context",
  ProjectList: "project.list",
  ProjectVariables: "project.variables",
  ConfigSettings: "config.settings",
  ConfigBrowserRuntime: "config.browserRuntime",
  FsPickFolder: "fs.pickFolder",
  CacheClear: "cache.clear",
  ScenarioNavigate: "scenario.navigate",
} as const;
export type ToolCapability = (typeof ToolCapability)[keyof typeof ToolCapability];

export const METHOD_CAPABILITY: Record<RpcMethod, ToolCapability> = {
  "project.getContext": "project.context",
  "project.list": "project.list",
  "project.getVariables": "project.variables",
  "config.getSettings": "config.settings",
  "config.getBrowserRuntime": "config.browserRuntime",
  "fs.pickFolder": "fs.pickFolder",
  "cache.clear": "cache.clear",
  "scenario.navigate": "scenario.navigate",
};

export interface RpcRequest {
  channel: typeof RPC_CHANNEL;
  kind: "request";
  id: string;
  method: RpcMethod;
  params?: unknown;
}

export interface RpcSuccess {
  channel: typeof RPC_CHANNEL;
  kind: "response";
  id: string;
  result: unknown;
}

export interface RpcFailure {
  channel: typeof RPC_CHANNEL;
  kind: "response";
  id: string;
  error: { code: number; message: string };
}

export type RpcResponse = RpcSuccess | RpcFailure;

/** Host → tool notification (no response expected). */
export interface RpcNotify {
  channel: typeof RPC_CHANNEL;
  kind: "notify";
  method: NotifyMethod;
  params?: unknown;
}

export type RpcMessage = RpcRequest | RpcResponse | RpcNotify;

export interface ProjectContextResult {
  projectId: string;
  projectName?: string;
  baseUrl: string;
  scenariosRelPath: string;
}

export interface NavigateScenarioParams {
  module: string;
  scenario: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  description?: string;
  envReady?: boolean;
  moduleCount?: number;
}

export interface GetProjectVariablesParams {
  projectId?: string;
}

export interface HostSettingsResult {
  defaultProject?: string;
  browser: {
    headless: boolean;
    slowMo: number;
    devtools: boolean;
    timeout: number;
    actionTimeout: number;
    navigationWaitUntil: NavigationWaitUntil;
    viewport: { width: number; height: number };
  };
  test: {
    defaultStepDelay: number;
    defaultStepTimeout: number;
    defaultReadyTimeout: number;
    intervalBetweenScenariosMs: number;
    continueOnScenarioFailure: boolean;
    defaultContinueOnFail: boolean;
  };
  output: {
    baseDir: string;
    logsDir: string;
    videosDir: string;
    recordVideo: boolean;
  };
  logging: {
    level: string;
    consoleOutput: boolean;
  };
}

export interface BrowserCheckResult {
  ok: boolean;
  status: BrowserCheckStatus;
  mode: BrowserRuntimeMode;
  platform: string;
  path: string;
  version: string;
  hints: string[];
}

export interface BrowserRuntimeConfig {
  version: number;
  mode: BrowserRuntimeMode;
  managed: { browsersPath: string };
  custom: { executablePath: string };
  detected: { version?: string; source?: string; verifiedAt?: string } | null;
}

export interface BrowserRuntimeResult {
  runtime: BrowserRuntimeConfig;
  check: BrowserCheckResult;
  engineVersion: string;
}

export const NotifyMethod = {
  ProjectContextChanged: "project.contextChanged",
  CacheClear: "cache.clear",
} as const;
export type NotifyMethod = (typeof NotifyMethod)[keyof typeof NotifyMethod];

export const NavigationWaitUntil = {
  Load: "load",
  DomContentLoaded: "domcontentloaded",
  NetworkIdle: "networkidle",
  Commit: "commit",
} as const;
export type NavigationWaitUntil =
  (typeof NavigationWaitUntil)[keyof typeof NavigationWaitUntil];

export const BrowserCheckStatus = {
  Missing: "missing",
  Invalid: "invalid",
  Ready: "ready",
} as const;
export type BrowserCheckStatus = (typeof BrowserCheckStatus)[keyof typeof BrowserCheckStatus];

export const BrowserRuntimeMode = {
  Managed: "managed",
  Custom: "custom",
} as const;
export type BrowserRuntimeMode = (typeof BrowserRuntimeMode)[keyof typeof BrowserRuntimeMode];

export function isRpcMessage(data: unknown): data is RpcMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as { channel?: unknown };
  return msg.channel === RPC_CHANNEL;
}

export const RpcErrorCode = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  CAPABILITY_DENIED: 403,
} as const;
