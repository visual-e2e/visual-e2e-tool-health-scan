import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_SCAN_OPTIONS, type LoginDefaults } from "./types.js";
import { getHostDataDir } from "./host-paths.js";
import { resolveE2eRoot } from "./paths.js";

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
}

export interface ProjectToolContext {
  projectId: string;
  projectName: string;
  baseUrl: string;
  scenariosRelPath: string;
  root: string;
}

function projectsDir(e2eRoot: string): string {
  const fromRpc = getHostDataDir()?.projects?.trim();
  if (fromRpc) return resolve(fromRpc);
  const fromEnv = process.env.PROJECTS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const storage = getHostDataDir()?.storage?.trim();
  if (storage) {
    const clientProjects = join(storage, "projects");
    if (existsSync(clientProjects)) return clientProjects;
  }
  return join(e2eRoot, "projects");
}

export function listProjects(): ProjectMeta[] {
  const dir = projectsDir(resolveE2eRoot());
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "project.json")))
    .map((e) => {
      try {
        const raw = JSON.parse(readFileSync(join(dir, e.name, "project.json"), "utf-8")) as ProjectMeta;
        return { id: raw.id ?? e.name, name: raw.name ?? e.name, description: raw.description };
      } catch {
        return { id: e.name, name: e.name };
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readEnvValue(envPath: string, key: string): string {
  if (!existsSync(envPath)) return "";
  const content = readFileSync(envPath, "utf-8");
  const match = content.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "im"));
  if (!match) return "";
  return match[1]!.trim().replace(/^["']|["']$/g, "");
}

function readBaseUrl(envPath: string): string {
  return readEnvValue(envPath, "BASE_URL");
}

function readVariablesLogin(variablesPath: string): Record<string, string> {
  if (!existsSync(variablesPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(variablesPath, "utf-8")) as {
      login?: Record<string, string>;
      global?: Record<string, string>;
    };
    return { ...(raw.global ?? {}), ...(raw.login ?? {}) };
  } catch {
    return {};
  }
}

export function resolveProjectToolContext(projectId: string): ProjectToolContext {
  const id = projectId.trim();
  if (!id) throw new Error("projectId 不能为空");
  const root = join(projectsDir(resolveE2eRoot()), id);
  if (!existsSync(join(root, "project.json"))) {
    throw new Error(`项目不存在: ${id}`);
  }
  let projectName = id;
  try {
    const raw = JSON.parse(readFileSync(join(root, "project.json"), "utf-8")) as ProjectMeta;
    projectName = raw.name ?? id;
  } catch {
    // keep id
  }
  return {
    projectId: id,
    projectName,
    baseUrl: readBaseUrl(join(root, ".env")),
    scenariosRelPath: `projects/${id}/scenarios`,
    root,
  };
}

/** Login defaults from project .env + fixtures/variables.json */
export function resolveProjectLoginDefaults(projectId: string): LoginDefaults {
  const ctx = resolveProjectToolContext(projectId);
  const envPath = join(ctx.root, ".env");
  const variablesPath = join(ctx.root, "fixtures", "variables.json");
  const loginVars = readVariablesLogin(variablesPath);

  const username = readEnvValue(envPath, "USERNAME");
  const password = readEnvValue(envPath, "PASSWORD");
  const baseUrl = (ctx.baseUrl || loginVars.url || "").replace(/\/$/, "");
  const loginPath = loginVars.login_path ?? "";
  const startUrl =
    baseUrl && loginPath
      ? `${baseUrl}${loginPath.startsWith("/") ? loginPath : `/${loginPath}`}`
      : baseUrl || undefined;

  return {
    startUrl,
    projectId: ctx.projectId,
    loginProfile:
      username || password
        ? { username, password, source: "rpc" }
        : undefined,
    loginSelectors: {
      username:
        loginVars.login_username_selector ?? DEFAULT_SCAN_OPTIONS.loginSelectors?.username,
      password:
        loginVars.login_password_selector ?? DEFAULT_SCAN_OPTIONS.loginSelectors?.password,
      submit: loginVars.login_submit_selector ?? DEFAULT_SCAN_OPTIONS.loginSelectors?.submit,
    },
  };
}
